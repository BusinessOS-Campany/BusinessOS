import "@/core/config/load-env";
import { describe, expect, it } from "vitest";
import { hasPermission } from "@/core/db/tenant-guard";
import {
  RESERVED_ORG_SLUGS,
  isReservedOrgSlug,
  isValidOrgSlug,
  orgHomePath,
  orgProfilePath,
  postSignInPath,
  safeNext,
} from "@/core/tenancy/org-route";
import { findUnauthorizedSyncOp, isSyncBatchAllowed } from "@/core/sync/permissions";
import type { SyncEntity, SyncOperation } from "@/core/sync/types";

/**
 * Unit coverage for the org-in-the-URL redirect rules and the offline sync
 * per-operation gate.
 *
 * DB-free on purpose: both surfaces are pure decision functions that sit in
 * front of the database, and the redirect rules are an authorization boundary
 * (an open redirect or an org-enumeration oracle would be a security bug). The
 * route-level behaviour - 404 for non-members, the redirect in the layout - is
 * exercised in the browser instead.
 */

describe("org slug validity", () => {
  it("accepts ordinary slugs", () => {
    for (const slug of ["haitham", "fixed-co", "a", "a1", "ab-12-cd"]) {
      expect(isValidOrgSlug(slug)).toBe(true);
    }
  });

  it("rejects slugs that are not URL-safe", () => {
    for (const slug of ["", "-a", "a-", "A", "a_b", "a.b", "a b", "a/b", "ü"]) {
      expect(isValidOrgSlug(slug)).toBe(false);
    }
  });

  it("rejects over-long slugs but allows exactly 63 characters", () => {
    expect(isValidOrgSlug("a".repeat(63))).toBe(true);
    expect(isValidOrgSlug("a".repeat(64))).toBe(false);
  });

  it("rejects every top-level segment the app already owns", () => {
    // These would be shadowed by the app's own routes, so an org using one
    // would have an unreachable URL.
    for (const slug of RESERVED_ORG_SLUGS) {
      expect(isReservedOrgSlug(slug)).toBe(true);
      expect(isValidOrgSlug(slug)).toBe(false);
    }
  });

  it("treats reserved slugs as case-insensitive", () => {
    expect(isReservedOrgSlug("API")).toBe(true);
    expect(isReservedOrgSlug("My-Apps")).toBe(true);
  });
});

describe("org path builders", () => {
  it("builds paths without injecting a scheme or a double slash", () => {
    expect(orgHomePath("fixed-co")).toBe("/fixed-co/my-apps");
    expect(orgProfilePath("fixed-co")).toBe("/fixed-co/profile");
  });
});

describe("safeNext", () => {
  it("rejects anything that is not a same-origin absolute path", () => {
    for (const value of [
      "https://evil.com",
      "//evil.com",
      "/\\evil.com",
      "javascript:alert(1)",
      "evil.com",
      "",
      "   ",
      "/has\ttab",
      "/has\nnewline",
      "/back\\slash",
    ]) {
      expect(safeNext(value, ["fixed-co"])).toBeNull();
    }
  });

  it("rejects null and undefined", () => {
    expect(safeNext(null, ["fixed-co"])).toBeNull();
    expect(safeNext(undefined, ["fixed-co"])).toBeNull();
  });

  it("allows a path inside one of the caller's own orgs", () => {
    expect(safeNext("/fixed-co/profile", ["fixed-co"])).toBe("/fixed-co/profile");
    expect(safeNext("/fixed-co/my-apps", ["fixed-co"])).toBe("/fixed-co/my-apps");
  });

  it("refuses an org the caller is not a member of", () => {
    // Otherwise the crafted link would only bounce them into a 404, and would
    // confirm the slug exists along the way.
    expect(safeNext("/otherco/profile", ["fixed-co"])).toBeNull();
  });

  it("keeps a deep path and its query string", () => {
    expect(safeNext("/fixed-co/profile?tab=overview", ["fixed-co"])).toBe(
      "/fixed-co/profile?tab=overview",
    );
  });

  it("allows the app's own non-org pages so sign-in can return to them", () => {
    expect(safeNext("/profile", ["fixed-co"])).toBe("/profile");
    expect(safeNext("/my-apps", ["fixed-co"])).toBe("/my-apps");
  });

  it("strips a leading space instead of treating it as a relative path", () => {
    expect(safeNext("  /fixed-co/profile", ["fixed-co"])).toBe("/fixed-co/profile");
  });
});

describe("postSignInPath", () => {
  it("sends a single-org user straight to that org's apps catalog, skipping the picker", () => {
    // The org's home is `/{slug}/my-apps`: the systems it has installed and can
    // install. The profile page was the old landing spot, and it is one click
    // away from a catalog an org with one app should not have to hunt for.
    // `orgHomePath` is the single source for that path so the two cannot drift.
    expect(postSignInPath({ orgSlugs: ["fixed-co"] })).toBe(orgHomePath("fixed-co"));
    expect(postSignInPath({ orgSlugs: ["fixed-co"] })).toBe("/fixed-co/my-apps");
  });

  it("sends a multi-org user to the picker", () => {
    expect(postSignInPath({ orgSlugs: ["fixed-co", "otherco"] })).toBe("/select-org");
  });

  it("sends a user with no orgs to provisioning, not to an empty picker", () => {
    expect(postSignInPath({ orgSlugs: [] })).toBe("/auth/complete-org");
  });

  it("provisions before honouring next, and drops it: no org can satisfy it yet", () => {
    // safeNext permits app-level paths with no org, so checking `next` first
    // would land a user with zero memberships on a protected page. An
    // org-scoped link is unsatisfiable too - the slug is what is being created.
    expect(postSignInPath({ next: "/profile", orgSlugs: [] })).toBe("/auth/complete-org");
    expect(postSignInPath({ next: "/fixed-co/profile", orgSlugs: [] })).toBe("/auth/complete-org");
  });

  it("prefers a validated next over the single-org shortcut", () => {
    expect(postSignInPath({ next: "/fixed-co/profile", orgSlugs: ["fixed-co"] })).toBe(
      "/fixed-co/profile",
    );
  });

  it("falls back to the single org when next is unsafe", () => {
    // An unsafe `next` is discarded, not sanitised, and the single org's own
    // home is where the user lands instead.
    expect(postSignInPath({ next: "https://evil.com", orgSlugs: ["fixed-co"] })).toBe(
      "/fixed-co/my-apps",
    );
    expect(postSignInPath({ next: "/otherco/profile", orgSlugs: ["fixed-co"] })).toBe(
      "/fixed-co/my-apps",
    );
  });

  it("sends a platform admin to the console instead of a customer org", () => {
    // The admin holds a member row in a real org, so the single-org rule would
    // otherwise land them in that customer's profile.
    expect(postSignInPath({ orgSlugs: ["fixed-co"], isPlatformAdmin: true })).toBe("/platform-admin");
    expect(postSignInPath({ orgSlugs: ["fixed-co", "otherco"], isPlatformAdmin: true })).toBe(
      "/platform-admin",
    );
  });

  it("does not send an admin with no orgs to org provisioning", () => {
    expect(postSignInPath({ orgSlugs: [], isPlatformAdmin: true })).toBe("/platform-admin");
  });

  it("still honours a validated next for an admin", () => {
    // A console shortcut must not swallow a link an admin was actually sent to.
    expect(
      postSignInPath({ next: "/platform-admin/tenants/abc", orgSlugs: ["fixed-co"], isPlatformAdmin: true }),
    ).toBe("/platform-admin/tenants/abc");
    expect(postSignInPath({ next: "/fixed-co/profile", orgSlugs: ["fixed-co"], isPlatformAdmin: true })).toBe(
      "/fixed-co/profile",
    );
  });

  it("refuses to carry an admin to an org they are not in", () => {
    expect(
      postSignInPath({ next: "/otherco/profile", orgSlugs: ["fixed-co"], isPlatformAdmin: true }),
    ).toBe("/platform-admin");
  });
});

describe("sync per-operation authorization", () => {
  it("allows a cashier to write the resources a POS actually syncs", () => {
    expect(
      isSyncBatchAllowed("cashier", [
        { entity: "salesInvoice", op: "create" },
        { entity: "customer", op: "create" },
        { entity: "customer", op: "update" },
      ]),
    ).toBe(true);
  });

  it("stops a cashier from smuggling an expense or cash-account write", () => {
    // The batch endpoint accepts arbitrary entity types, so a blanket check
    // would either lock cashers out of sync or let this through.
    expect(isSyncBatchAllowed("cashier", [{ entity: "expense", op: "create" }])).toBe(false);
    expect(isSyncBatchAllowed("cashier", [{ entity: "cashAccount", op: "update" }])).toBe(false);
  });

  it("requires settings manage for branch writes", () => {
    // `branch` maps to the `settings` module, whose only write verb is
    // `manage`. A manager holds `settings:read`, so it must not qualify.
    expect(isSyncBatchAllowed("manager", [{ entity: "branch", op: "update" }])).toBe(false);
    expect(isSyncBatchAllowed("owner", [{ entity: "branch", op: "update" }])).toBe(true);
  });

  it("treats a warehouse write as a stock adjustment", () => {
    // `inventory` has no create/update/delete verbs at all, so a naive mapping
    // would deny the owner their own back-office writes.
    for (const op of ["create", "update", "delete"] as const) {
      expect(isSyncBatchAllowed("owner", [{ entity: "warehouse", op }])).toBe(true);
      expect(isSyncBatchAllowed("cashier", [{ entity: "warehouse", op }])).toBe(false);
    }
  });

  it("allows owner everything and viewer nothing", () => {
    expect(
      isSyncBatchAllowed("owner", [
        { entity: "expense", op: "delete" },
        { entity: "branch", op: "delete" },
        { entity: "warehouse", op: "update" },
        { entity: "cashAccount", op: "delete" },
      ]),
    ).toBe(true);
    expect(isSyncBatchAllowed("viewer", [{ entity: "product", op: "create" }])).toBe(false);
    expect(isSyncBatchAllowed("viewer", [{ entity: "product", op: "update" }])).toBe(false);
  });

  it("rejects the whole batch when any single operation is forbidden", () => {
    // The batch is all-or-nothing by idempotencyKey, so failing the request is
    // consistent with how it already reports per-op results. The allowed op
    // comes first, so the failure is attributed to the right one.
    const denied = findUnauthorizedSyncOp("cashier", [
      { entity: "customer", op: "update" },
      { entity: "expense", op: "create" },
    ]);
    expect(denied).toEqual({ entity: "expense", op: "create", module: "expenses" });
  });

  it("reports the module the role actually lacks", () => {
    expect(findUnauthorizedSyncOp("viewer", [{ entity: "supplier", op: "create" }])).toEqual({
      entity: "supplier",
      op: "create",
      module: "suppliers",
    });
  });

  it("maps every entity to a module the owner holds and the viewer lacks", () => {
    // Guards against the table drifting from the catalog: an entity with a typo'd
    // module would resolve to a statement nobody holds, silently denying the
    // owner their own back-office sync.
    const expected: Record<string, string> = {
      product: "products",
      customer: "customers",
      supplier: "suppliers",
      category: "products",
      unit: "products",
      branch: "settings",
      warehouse: "inventory",
      expense: "expenses",
      cashAccount: "finance",
      salesInvoice: "sales",
      purchase: "purchases",
    };
    for (const [entity, moduleName] of Object.entries(expected)) {
      for (const op of ["create", "update", "delete"] as const) {
        const entry = { entity, op } as { entity: SyncEntity; op: SyncOperation };
        expect(isSyncBatchAllowed("owner", [entry]), `${entity}.${op}`).toBe(true);
        const denied = findUnauthorizedSyncOp("viewer", [entry]);
        expect(denied?.module, `${entity}.${op}`).toBe(moduleName);
      }
    }
  });

  it("treats taxonomy as part of the product catalog", () => {
    // A role that cannot edit products should not be able to invent the
    // categories they are filed under, so `category` and `unit` are gated by
    // exactly the same product permission.
    for (const entity of ["category", "unit"] as const) {
      for (const verb of ["create", "update", "delete"] as const) {
        const allowed = isSyncBatchAllowed("cashier", [{ entity, op: verb }]);
        expect(allowed).toBe(hasPermission("cashier", { products: [verb] }));
      }
    }
  });
});

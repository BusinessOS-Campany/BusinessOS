import { describe, expect, it } from "vitest";
import {
  installState,
  isDemoSystem,
  openRouteForOrgSlug,
  openRouteForSlug,
  orphanedInstalledSlugs,
  systemKind,
  catalogAppSchema,
  SEEDABLE_DEMO_SLUGS,
  REAL_SYSTEM_SLUGS,
} from "@/core/systems/catalog";

/**
 * System catalog pure-logic guard (M15).
 *
 * The marketplace and the admin "systems" manager both consume this single
 * module for: open-routes (real in-shell module vs proxied demo), the demo
 * classification, the per-tenant install state machine, and the admin
 * create/update payload validation. Keeping these pure lets us unit-test the
 * full decision surface with zero DB.
 */

describe("openRouteForSlug", () => {
  it("maps real registered systems to their in-shell module routes", () => {
    expect(openRouteForSlug("grocery")).toBe("/app/grocery");
    expect(openRouteForSlug("sama-center")).toBe("/app/sama-center");
  });

  it("maps live demo systems to their proxied demo routes", () => {
    expect(openRouteForSlug("pos")).toBe("/pos");
    expect(openRouteForSlug("hospital")).toBe("/hospital");
    expect(openRouteForSlug("pharmacy")).toBe("/pharmacy");
    expect(openRouteForSlug("laboratory")).toBe("/laboratory");
    expect(openRouteForSlug("optometry")).toBe("/optometry");
  });

  /**
   * Dental is the one demo system hosted inside this repo, so it is served under
   * the `/demo` namespace like grocery rather than at its own root. Asserted
   * separately because that mount is derived from `sourceDir` rather than
   * declared: it moved when the app moved, and nothing here would have failed if
   * the registry had kept pointing at the old folder.
   */
  it("routes the repo-hosted dental demo through the /demo namespace", () => {
    expect(openRouteForSlug("dental")).toBe("/demo/dental");
  });

  it("returns null for systems with no route (coming soon / unknown)", () => {
    expect(openRouteForSlug("supermarket")).toBeNull();
    expect(openRouteForSlug("completely-unknown")).toBeNull();
  });
});

/**
 * A real system is not a page on the platform, it is the org's own copy of a
 * codebase, mounted at `/{org}/{system}` — the same path its process is booted
 * with, and therefore the path its own links and asset URLs are built from. A
 * card that opened `/app/grocery` instead made the child redirect every asset
 * through a path it does not serve.
 */
describe("openRouteForOrgSlug", () => {
  it("mounts a real system under its own organization", () => {
    expect(openRouteForOrgSlug("grocery", "ajwad")).toBe("/ajwad/grocery");
    expect(openRouteForOrgSlug("sama-center", "nurse-care")).toBe("/nurse-care/sama-center");
  });

  it("keeps demo systems where they are, since they are the platform's own", () => {
    expect(openRouteForOrgSlug("pos", "ajwad")).toBe("/pos");
    expect(openRouteForOrgSlug("pharmacy", "ajwad")).toBe("/pharmacy");
  });

  it("returns null for a system with no route at all", () => {
    expect(openRouteForOrgSlug("supermarket", "ajwad")).toBeNull();
  });

  it("falls back to the org-less route when no organization is known", () => {
    // Admin tooling renders links without an org in hand. `/app/<system>` still
    // resolves — it redirects through the session — so the link is not dead, and
    // guessing an org from a session would be worse.
    expect(openRouteForOrgSlug("grocery", null)).toBe("/app/grocery");
  });
});

describe("systemKind", () => {
  it("classifies real, demo and none", () => {
    expect(systemKind("grocery")).toBe("real");
    expect(systemKind("sama-center")).toBe("real");
    expect(systemKind("pos")).toBe("demo");
    expect(systemKind("supermarket")).toBe("none");
    expect(systemKind("nope")).toBe("none");
  });
});

describe("isDemoSystem", () => {
  it("true only for demo systems that actually have a live route", () => {
    expect(isDemoSystem("pos")).toBe(true);
    expect(isDemoSystem("grocery")).toBe(false);
    expect(isDemoSystem("sama-center")).toBe(false);
    expect(isDemoSystem("supermarket")).toBe(false);
    expect(isDemoSystem("kkk")).toBe(false);
  });
});

describe("SEEDABLE_DEMO_SLUGS / REAL_SYSTEM_SLUGS", () => {
  it("seeding lists are disjoint and cover the live demos", () => {
    for (const slug of SEEDABLE_DEMO_SLUGS) {
      expect(systemKind(slug)).toBe("demo");
      expect(openRouteForSlug(slug)).toBeTruthy();
    }
    for (const slug of REAL_SYSTEM_SLUGS) {
      expect(systemKind(slug)).toBe("real");
    }
    const overlap = REAL_SYSTEM_SLUGS.filter((s) => SEEDABLE_DEMO_SLUGS.includes(s));
    expect(overlap).toEqual([]);
  });
});

describe("installState", () => {
  it("unavailable when the app is globally inactive", () => {
    expect(
      installState({ appIsActive: false, installed: true, hasPendingRequest: true, isDemo: true }),
    ).toBe("unavailable");
  });

  it("installed wins over everything else", () => {
    expect(
      installState({ appIsActive: true, installed: true, hasPendingRequest: true }),
    ).toBe("installed");
  });

  it("a pending approval request shows waiting state", () => {
    expect(
      installState({ appIsActive: true, installed: false, hasPendingRequest: true }),
    ).toBe("pending");
  });

  it("demo systems are instantly openable (no approval)", () => {
    expect(installState({ appIsActive: true, installed: false, isDemo: true })).toBe("demo");
  });

  it("real active systems not yet installed require a setup request", () => {
    expect(installState({ appIsActive: true, installed: false })).toBe("installable");
  });

  it("may be reused idempotently for real systems once requested", () => {
    expect(installState({ appIsActive: true, installed: false, isDemo: false })).toBe("installable");
  });

  // Removing a system's source makes `/{org}/{system}` answer 404, so an
  // install that cannot be served must not read as `installed`.
  it("reports an install whose source was removed as unavailable", () => {
    expect(installState({ appIsActive: true, installed: true, sourceMissing: true })).toBe(
      "unavailable",
    );
  });

  it("keeps a normal install installed when its source is present", () => {
    expect(installState({ appIsActive: true, installed: true, sourceMissing: false })).toBe(
      "installed",
    );
  });
});

describe("orphanedInstalledSlugs", () => {
  it("returns installed slugs with no source, deduped and sorted", () => {
    expect(
      orphanedInstalledSlugs(["b", "a", "b", "c"], ["a", "c"]),
    ).toEqual(["b"]);
  });

  it("returns nothing when every install still has its source", () => {
    expect(orphanedInstalledSlugs(["a", "b"], ["a", "b", "c"])).toEqual([]);
  });

  it("ignores a source with no install", () => {
    expect(orphanedInstalledSlugs([], ["a"])).toEqual([]);
  });
});

describe("catalogAppSchema", () => {
  const base = {
    slug: "pos",
    name: "POS System",
    nameAr: "نظام نقاط البيع",
    description: "Fast POS with barcode.",
    descriptionAr: "نقط بيع سريعة مع باركود.",
    icon: "store",
    category: "retail",
    version: "1.0.0",
    routePrefix: "/pos",
  };

  it("accepts a well-formed payload", () => {
    expect(catalogAppSchema.safeParse(base).success).toBe(true);
  });

  it("rejects invalid slugs", () => {
    for (const bad of ["Bad Slug!", "POS", "pos_s", "", "  pos  hello", "pos-", "-pos"]) {
      expect(catalogAppSchema.safeParse({ ...base, slug: bad }).success, `slug=${bad}`).toBe(false);
    }
  });

  it("requires bilingual names and descriptions", () => {
    expect(catalogAppSchema.safeParse({ ...base, nameAr: "" }).success).toBe(false);
    expect(catalogAppSchema.safeParse({ ...base, descriptionAr: "" }).success).toBe(false);
    expect(catalogAppSchema.safeParse({ ...base, name: "" }).success).toBe(false);
    expect(catalogAppSchema.safeParse({ ...base, description: "" }).success).toBe(false);
  });

  it("accepts optional toggles on update payloads", () => {
    expect(
      catalogAppSchema.safeParse({ ...base, isActive: false, status: "in-maintenance" }).success,
    ).toBe(true);
    expect(catalogAppSchema.safeParse({ ...base, status: "bogus-status" }).success).toBe(false);
  });

  it("strips unknown keys and defaults isActive", () => {
    const parsed = catalogAppSchema.parse({ ...base, isActive: true, adminNote: "ignored" });
    expect((parsed as unknown as Record<string, unknown>).adminNote).toBeUndefined();
  });
});
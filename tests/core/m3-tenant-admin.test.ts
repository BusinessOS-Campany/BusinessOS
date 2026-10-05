import "@/core/config/load-env";
import { describe, expect, it } from "vitest";
import {
  deepMerge,
  isModuleEnabled,
  hasInShellModules,
  brandingCssVars,
  type OrgSettings,
} from "@/core/tenancy/settings";
import { hasPermission, requireModule } from "@/core/db/tenant-guard";
import { ApiError } from "@/core/http/api";

describe("M3 module gate", () => {
  const base: OrgSettings = { locale: "ar" };

  it("treats unset modulesEnabled as all-enabled (back-compat)", () => {
    expect(isModuleEnabled(base, "pos")).toBe(true);
    expect(isModuleEnabled(base, "ai")).toBe(true);
  });

  it("enforces the explicit enabled list", () => {
    const s: OrgSettings = { modulesEnabled: ["sales", "inventory"] };
    expect(isModuleEnabled(s, "sales")).toBe(true);
    expect(isModuleEnabled(s, "pos")).toBe(false);
  });

  it("requireModule throws canonical 404 MODULE_DISABLED", () => {
    const s: OrgSettings = { modulesEnabled: ["inventory"] };
    expect(() => requireModule(s, "pos")).toThrow(ApiError);
    try {
      requireModule(s, "pos");
    } catch (err) {
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(404);
      expect(apiErr.code).toBe("MODULE_DISABLED");
      expect(apiErr.messageEn).toMatch(/not enabled/i);
    }
    expect(() => requireModule(s, "inventory")).not.toThrow();
  });
});

/**
 * Whether the shared in-shell ERP is this org's product at all.
 *
 * The answer is a list that is explicitly empty, and the distinction from "unset"
 * is the whole point. An org created without a template is written with
 * `modulesEnabled: []` — it has been told, deliberately, that it runs none of
 * the platform's built-in modules, because it installs its own systems instead.
 * An org that predates the list has it unset, which `isModuleEnabled` reads as
 * "all enabled" for backwards compatibility, and that org must keep its shell.
 */
describe("M3 in-shell ERP ownership", () => {
  it("is false for an org explicitly given no modules", () => {
    expect(hasInShellModules({ modulesEnabled: [] })).toBe(false);
  });

  it("is true for an org that enabled at least one module", () => {
    expect(hasInShellModules({ modulesEnabled: ["sales"] })).toBe(true);
  });

  it("is true for an org predating the list — unset means all enabled", () => {
    // Must match `isModuleEnabled`'s own back-compat rule, or an existing
    // customer would be redirected away from a shell they can actually use.
    expect(hasInShellModules({})).toBe(true);
    expect(hasInShellModules({ locale: "ar" })).toBe(true);
  });

  it("ignores a malformed list rather than crashing the shell", () => {
    expect(hasInShellModules({ modulesEnabled: "sales" as never })).toBe(true);
  });
});

describe("M3 settings deepMerge", () => {
  it("merges nested objects without mutating inputs", () => {
    const base = { branding: { primary: "#000000", radius: 8 }, locale: "ar" };
    const patch = { branding: { radius: 12 }, locale: "en" };
    const out = deepMerge(base, patch);
    expect(out).toEqual({ branding: { primary: "#000000", radius: 12 }, locale: "en" });
    expect(base.branding.radius).toBe(8); // untouched
  });

  it("replaces arrays wholesale and drops undefined keys", () => {
    const out = deepMerge(
      { modulesEnabled: ["sales", "pos"], branding: { logoUrl: "x" } },
      { modulesEnabled: ["sales"], branding: { logoUrl: undefined } },
    );
    expect(out.modulesEnabled).toEqual(["sales"]);
    expect(out.branding).toEqual({});
  });
});

describe("M3 branding css vars", () => {
  it("emits only provided tokens with correct units", () => {
    expect(brandingCssVars(undefined)).toEqual({});
    expect(brandingCssVars({ primary: "#10b981" })).toEqual({ "--brand-primary": "#10b981" });
    expect(brandingCssVars({ radius: 12 })).toEqual({ "--brand-radius": "12px" });
  });
});

describe("M3 admin permission boundaries", () => {
  it("only owner+admin manage roles; manager reads users but cannot invite", () => {
    expect(hasPermission("owner", { roles: ["manage"] })).toBe(true);
    expect(hasPermission("admin", { roles: ["manage"] })).toBe(false);
    expect(hasPermission("manager", { users: ["read"] })).toBe(true);
    expect(hasPermission("manager", { users: ["invite"] })).toBe(false);
    expect(hasPermission("cashier", { settings: ["manage"] })).toBe(false);
  });

  it("unknown roles are denied everything (defense in depth)", () => {
    expect(hasPermission("superadmin", { users: ["read"] })).toBe(false);
  });
});

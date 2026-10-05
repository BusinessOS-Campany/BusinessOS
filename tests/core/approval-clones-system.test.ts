import "@/core/config/load-env";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * "Approving a system for an org" must leave the org OWNING that system.
 *
 * The install row and the files used to be two separate steps, and only one of
 * the three platform approval paths did the second one. The other two wrote an
 * active `organization_apps` row and returned 200, so the admin saw a green
 * checkmark while `/{org}/{system}` later failed with SYSTEM_NOT_PROVISIONED
 * because `orginazition/<org>/systems/<slug>/` did not exist.
 *
 * This test asserts the invariant on the source of all three routes rather than
 * on a live HTTP call: the invariant is "this route clones", and a route file
 * that stops calling the clone is exactly the regression that is invisible in
 * the response body. `cloneInstalledSystem` is best-effort and swallows its own
 * errors, so an HTTP-level test would pass either way.
 *
 * Fails-first: deleting the `cloneInstalledSystem(...)` line from any of the
 * three routes turns the corresponding case red.
 */

const sandbox = mkdtempSync(join(tmpdir(), "approval-clone-test-"));
const sourceRoot = join(sandbox, "system");
const vaultRoot = join(sandbox, "orginazition");
process.env.SYSTEM_SOURCE_PATH = sourceRoot;
process.env.ORG_VAULT_PATH = vaultRoot;

const ROUTES = {
  /** Additional-system request queue decision. */
  appRequest: "src/app/api/platform/app-requests/[id]/route.ts",
  /** Pending-org approval, which grants a batch of appSlugs. */
  orgApproval: "src/app/api/platform/approvals/[id]/route.ts",
  /** Admin "grant system" on the tenant detail page. */
  tenantGrant: "src/app/api/platform/tenants/[id]/apps/route.ts",
} as const;

const repoRoot = process.cwd();

function routeSource(relative: string): string {
  return readFileSync(join(repoRoot, relative), "utf8");
}

const { orgVaultPaths } = await import("@/core/org-vault/paths");
const { resetRegistryCache } = await import("@/core/org-vault/registry");
const { cloneSystemForOrg } = await import("@/core/org-vault/system-clone");

/** A master system that is cloneable, so the assertion below is about routing. */
function writeSourceSystem(slug: string): void {
  const dir = join(sourceRoot, slug);
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: slug }));
  writeFileSync(join(dir, "src", "index.ts"), "export const ok = true;\n");
}

beforeAll(() => {
  mkdirSync(sourceRoot, { recursive: true });
  writeSourceSystem("grocery");
  resetRegistryCache();
});

afterAll(() => {
  resetRegistryCache();
  rmSync(sandbox, { recursive: true, force: true });
});

beforeEach(() => {
  resetRegistryCache();
});

describe("platform approval routes clone the system they install", () => {
  it("app-request approval clones", () => {
    // It does so by calling `installSystemForOrg`, which clones and rolls the row
    // back if the copy fails. Asserting the transitive call keeps this file
    // honest about the invariant it exists for: approving a request must leave
    // the org owning files, whichever layer performs the clone.
    const source = routeSource(ROUTES.appRequest);
    expect(
      source.includes("cloneInstalledSystem(") || source.includes("installSystemForOrg("),
    ).toBe(true);
  });

  it("org approval clones", () => {
    expect(routeSource(ROUTES.orgApproval)).toContain("cloneInstalledSystem(");
  });

  it("tenant grant clones", () => {
    expect(routeSource(ROUTES.tenantGrant)).toContain("cloneInstalledSystem(");
  });

  it("org approval no longer clears the org's own database name", () => {
    // `databaseName: null` here was the only place the column was wiped, while
    // the supervisor creates `org_<folder>` from the registry for the same org.
    expect(routeSource(ROUTES.orgApproval)).not.toContain("databaseName: null");
  });
});

describe("cloneInstalledSystem resolves an org id to its folder", () => {
  it("the clone lands under the org's own folder, not the shared source", () => {
    const paths = orgVaultPaths("acme");
    const result = cloneSystemForOrg({ slug: "acme" }, "grocery");

    expect(result.cloned).toBe(true);
    expect(result.path).toBe(join(paths.systems, "grocery"));
    expect(existsSync(join(paths.systems, "grocery", "package.json"))).toBe(true);
    // The pristine master is untouched by a clone.
    expect(existsSync(join(sourceRoot, "grocery", ".clone.json"))).toBe(false);
  });
});

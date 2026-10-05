import "@/core/config/load-env";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Per-org system clones, tested without a database.
 *
 * Two env roots are redirected so nothing here touches the real `system/` or
 * `orginazition/`: `SYSTEM_SOURCE_PATH` is the pristine master and
 * `ORG_VAULT_PATH` is where org folders land. Both are read per call, never
 * cached at import time, so setting them before the dynamic imports is enough.
 */

const sandbox = mkdtempSync(join(tmpdir(), "system-clone-test-"));
const sourceRoot = join(sandbox, "system");
const vaultRoot = join(sandbox, "orginazition");
process.env.SYSTEM_SOURCE_PATH = sourceRoot;
process.env.ORG_VAULT_PATH = vaultRoot;

const { orgVaultPaths, ensureOrgVaultDirs } = await import("@/core/org-vault/paths");
const { resetRegistryCache } = await import("@/core/org-vault/registry");
const { cloneSystemForOrg, listSystemSources, hasSystemSource } = await import("@/core/org-vault/system-clone");

/** Builds a small master system with the directories we refuse to copy. */
function writeSourceSystem(slug: string): string {
  const dir = join(sourceRoot, slug);
  mkdirSync(join(dir, "src"), { recursive: true });
  mkdirSync(join(dir, "node_modules", "left-pad"), { recursive: true });
  mkdirSync(join(dir, ".next", "cache"), { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: slug }));
  writeFileSync(join(dir, "src", "index.ts"), "export const ok = true;\n");
  writeFileSync(join(dir, "node_modules", "left-pad", "index.js"), "module.exports = 1;\n");
  writeFileSync(join(dir, ".next", "cache", "junk"), "x");
  return dir;
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

describe("system source root", () => {
  it("lists only slugs that have a master folder", () => {
    writeSourceSystem("sama-center");
    mkdirSync(join(sourceRoot, "node_modules"), { recursive: true });
    const sources = listSystemSources();
    expect(sources).toContain("grocery");
    expect(sources).toContain("sama-center");
    expect(sources).not.toContain("node_modules");
  });

  it("reports a slug with no master as un-cloneable instead of throwing", () => {
    expect(hasSystemSource("pos")).toBe(false);
    expect(hasSystemSource("grocery")).toBe(true);
  });
});

describe("cloneSystemForOrg", () => {
  it("copies the master into orginazition/<org>/systems/<slug>", () => {
    const paths = ensureOrgVaultDirs(orgVaultPaths("acme"));
    const result = cloneSystemForOrg({ slug: "acme" }, "grocery");

    expect(result.cloned).toBe(true);
    expect(result.fresh).toBe(true);
    expect(result.path).toBe(join(paths.systems, "grocery"));
    expect(existsSync(join(paths.systems, "grocery", "package.json"))).toBe(true);
    expect(readFileSync(join(paths.systems, "grocery", "src", "index.ts"), "utf8")).toContain("ok = true");
  });

  it("never copies node_modules, .next and friends", () => {
    const paths = orgVaultPaths("acme");
    cloneSystemForOrg({ slug: "acme" }, "grocery");
    expect(existsSync(join(paths.systems, "grocery", "node_modules"))).toBe(false);
    expect(existsSync(join(paths.systems, "grocery", ".next"))).toBe(false);
    // package.json and src/ came across, so the exclusion is a filter and not
    // an empty clone.
    expect(existsSync(join(paths.systems, "grocery", "src"))).toBe(true);
  });

  it("stamps the clone so a re-run can recognise it", () => {
    const paths = orgVaultPaths("acme");
    const stamp = JSON.parse(readFileSync(join(paths.systems, "grocery", ".clone.json"), "utf8"));
    expect(stamp.systemSlug).toBe("grocery");
    expect(stamp.orgSlug).toBe("acme");
    expect(stamp.files).toBeGreaterThan(0);
    expect(typeof stamp.clonedAt).toBe("string");
  });

  it("is idempotent: a second run keeps the org's own edits", () => {
    const paths = orgVaultPaths("acme");
    const edited = join(paths.systems, "grocery", "src", "index.ts");
    writeFileSync(edited, "// customised by acme\n");

    const again = cloneSystemForOrg({ slug: "acme" }, "grocery");

    expect(again.cloned).toBe(true);
    expect(again.fresh).toBe(false);
    expect(readFileSync(edited, "utf8")).toBe("// customised by acme\n");
  });

  it("gives each org its own copy, so one tenant cannot see another's", () => {
    ensureOrgVaultDirs(orgVaultPaths("globex"));
    const result = cloneSystemForOrg({ slug: "globex" }, "grocery");
    expect(result.cloned).toBe(true);

    const acme = orgVaultPaths("acme").systems;
    const globex = orgVaultPaths("globex").systems;
    expect(acme).not.toBe(globex);
    // Globex gets the pristine master, not Acme's edited copy.
    expect(readFileSync(join(globex, "grocery", "src", "index.ts"), "utf8")).toContain("ok = true");
  });

  it("skips a system with no master and explains why", () => {
    const result = cloneSystemForOrg({ slug: "acme" }, "pos");
    expect(result.cloned).toBe(false);
    expect(result.fresh).toBe(false);
    expect(result.files).toBe(0);
    expect(result.reason).toContain("no source folder");
  });
});

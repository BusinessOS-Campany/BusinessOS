import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Source resolution across the vendored root and the GitHub-imported root.
 *
 * `system/<slug>` is the reviewed, in-repo master; `.systems/<slug>` is a
 * repository the deployment worker checked out. The install flow, the catalog
 * and the runtime proxy all gate on `listSystemSources()`, so the two roots must
 * be one list to the rest of the app — while `listVendoredSystemSources()` keeps
 * answering the narrower "what does this repo ship" question.
 *
 * Both roots are read per call (never cached at import time), so pointing the
 * two env vars at temp directories keeps this off the real `system/`.
 */

const vendored = mkdtempSync(join(tmpdir(), "bos-sys-vendored-"));
const managed = mkdtempSync(join(tmpdir(), "bos-sys-managed-"));
process.env.SYSTEM_SOURCE_PATH = vendored;
process.env.MANAGED_SYSTEM_PATH = managed;

const {
  hasSystemSource,
  listSystemSources,
  listVendoredSystemSources,
  systemSourceDir,
} = await import("@/core/org-vault/system-sources");

function makeSystem(root: string, slug: string): void {
  mkdirSync(join(root, slug), { recursive: true });
  writeFileSync(join(root, slug, "package.json"), JSON.stringify({ name: slug, scripts: {} }));
}

beforeAll(() => {
  makeSystem(vendored, "grocery");
  makeSystem(managed, "clinic");
  // A directory without a package.json is not a system, in either root.
  mkdirSync(join(managed, "notes"), { recursive: true });
});

afterAll(() => {
  rmSync(vendored, { recursive: true, force: true });
  rmSync(managed, { recursive: true, force: true });
});

describe("system source discovery", () => {
  it("lists vendored sources only from the vendored root", () => {
    expect(listVendoredSystemSources()).toEqual(["grocery"]);
  });

  it("lists vendored and imported sources together", () => {
    expect(listSystemSources()).toEqual(["clinic", "grocery"]);
  });

  it("resolves a vendored slug to the vendored root", () => {
    expect(systemSourceDir("grocery")).toBe(join(vendored, "grocery"));
  });

  it("resolves an imported slug to the managed root", () => {
    expect(systemSourceDir("clinic")).toBe(join(managed, "clinic"));
  });

  it("ignores a folder without a package.json", () => {
    // `listSystemSources()` is the gate: the folder is a directory, so
    // `hasSystemSource` is true, but it is not listed as a system.
    expect(listSystemSources()).not.toContain("notes");
    expect(hasSystemSource("notes")).toBe(true);
  });

  it("reports a missing slug as having no source", () => {
    expect(hasSystemSource("does-not-exist")).toBe(false);
  });

  it("lets a vendored source shadow an imported one of the same slug", () => {
    makeSystem(vendored, "shared");
    makeSystem(managed, "shared");
    expect(systemSourceDir("shared")).toBe(join(vendored, "shared"));
    expect(listSystemSources().filter((slug) => slug === "shared")).toHaveLength(1);
  });
});

import "@/core/config/load-env";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureOrgSystemSource } from "@/core/systems/runtime/supervisor";
import type { CloneResult } from "@/core/org-vault/system-clone";

/**
 * An org can hold the install row without holding the files: an install from
 * before the per-org vault existed, a clone that failed, or a folder someone
 * deleted. The request that discovered this came back as a 500 naming a server
 * directory, on a *prefetch* — so merely opening the profile tab raised it.
 *
 * The runtime's answer is to provision the copy from the platform's own, which
 * is the same repair the install path performs. These tests cover that decision
 * with an injected clone, because cloning a real system folder is not something
 * a unit test should do.
 */
describe("an org that has the install but not the files", () => {
  let root: string;
  let cwd: string;

  const ok = (over: Partial<CloneResult> = {}): CloneResult => ({
    cloned: true,
    fresh: true,
    path: "",
    files: 12,
    ...over,
  });

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "org-source-"));
    cwd = join(root, "systems", "grocery");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("clones the system in and reports the source as present", () => {
    const clone = (org: { slug: string }, slug: string): CloneResult => {
      // What a real clone leaves behind: a folder with a package.json.
      mkdirSync(cwd, { recursive: true });
      writeFileSync(join(cwd, "package.json"), "{}");
      expect(org.slug).toBe("ajwad");
      expect(slug).toBe("grocery");
      return ok({ path: cwd });
    };

    expect(ensureOrgSystemSource("ajwad", "grocery", cwd, clone)).toBe(true);
  });

  it("does not clone when the org already has the files", () => {
    mkdirSync(cwd, { recursive: true });
    writeFileSync(join(cwd, "package.json"), "{}");
    let called = false;

    const present = ensureOrgSystemSource("ajwad", "grocery", cwd, () => {
      called = true;
      return ok();
    });

    expect(present).toBe(true);
    expect(called).toBe(false);
  });

  it("reports missing when there is no platform copy to clone from", () => {
    const missing = ensureOrgSystemSource("ajwad", "grocery", cwd, () =>
      ok({ cloned: false, fresh: false, files: 0, reason: "no source folder" }),
    );

    expect(missing).toBe(false);
  });

  it("reports missing when a clone claims success but leaves no source", () => {
    // The clone never throws, so a silent no-op is the failure mode worth
    // pinning: a truthy result must not be trusted over the filesystem.
    const lied = ensureOrgSystemSource("ajwad", "grocery", cwd, () => ok());

    expect(lied).toBe(false);
  });
});

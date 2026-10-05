import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Where the dental runtime writes uploaded files, and whether git can see them.
 *
 * `src/lib/storage.ts` resolves its root from `process.cwd()`, and the
 * supervisor starts each org's child inside that org's own clone — so per-org
 * isolation does *not* depend on the platform injecting `UPLOAD_DIR`. That was
 * the recorded theory and it was wrong.
 *
 * What is real is narrower and just as bad: the fallback puts uploads inside the
 * tree the app lives in. For an org that tree is gitignored, so customer files
 * are safe. For `system/dental` and `demo-systems/dental` it is not — and
 * `/demo/dental` is publicly reachable, so a patient's imaging lands at an
 * untracked-but-not-ignored path one `git add -A` away from being committed.
 *
 * Both trees already contain the empty `serverdata/uploads/imaging` folder, so
 * this is a waiting accident rather than a hypothetical one.
 */
const REPO_ROOT = process.cwd();

/**
 * Asked of git itself rather than a reimplementation of its ignore rules, so
 * this asserts the property that matters instead of asserting on file text.
 */
function isIgnored(relativePath: string): boolean {
  try {
    execFileSync("git", ["check-ignore", "-q", "--no-index", "--", relativePath], {
      cwd: REPO_ROOT,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

/** Both dental trees, plus the per-org clone that runs in production. */
const UPLOAD_ROOTS = [
  "system/dental/serverdata/uploads",
  "demo-systems/dental/serverdata/uploads",
  "orginazition/gm/systems/dental/serverdata/uploads",
];

describe("dental upload roots", () => {
  for (const root of UPLOAD_ROOTS) {
    it(`keeps uploaded files out of git: ${root}`, () => {
      expect(isIgnored(join(root, "imaging", "patient-001.jpg"))).toBe(true);
    });
  }

  it("covers every subdirectory saveFile can be asked to write to", () => {
    // `saveFile` sanitises the subdir to `[A-Za-z0-9_]` rather than allowlisting
    // it, so any name is reachable and the rule cannot enumerate them.
    for (const sub of ["imaging", "records", "documents", "x_ray", "A1", "attachments"]) {
      expect(isIgnored(`system/dental/serverdata/uploads/${sub}/scan.pdf`), sub).toBe(true);
      expect(isIgnored(`demo-systems/dental/serverdata/uploads/${sub}/scan.pdf`), sub).toBe(true);
    }
  });

  it("covers a file written at the root of the upload folder", () => {
    expect(isIgnored("system/dental/serverdata/uploads/orphan.pdf")).toBe(true);
  });
});

/**
 * The invariant that actually provides per-org isolation. If this changes, the
 * orgs share an upload folder, so it is pinned rather than left to a comment.
 */
describe("what makes per-org uploads separate", () => {
  it("still resolves the upload root from the working directory", () => {
    const source = readFileSync(join(REPO_ROOT, "system/dental/src/lib/storage.ts"), "utf-8");
    expect(source).toContain('path.join(process.cwd(), "serverdata", "uploads")');
  });

  it("starts each org's child inside that org's own clone", () => {
    // supervisor.ts passes `cwd: runtime.cwd` to the spawn, and runtime.cwd is
    // the org's cloned system directory.
    const source = readFileSync(
      join(REPO_ROOT, "src/core/systems/runtime/supervisor.ts"),
      "utf-8",
    );
    expect(source).toContain("cwd: runtime.cwd");
  });
});
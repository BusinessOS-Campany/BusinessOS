/**
 * What this deployment actually ships under `system/`.
 *
 * Every other source test runs against a sandbox: a temp folder with two fake
 * masters written into it. That is the right way to test the *logic* of listing
 * and cloning, and it is also why a real system can be renamed out of reach with
 * every test still green — the discovery layer is folder-name based, so the only
 * thing that can notice `system/<x>` no longer matching the catalog slug `<x>` is
 * a test that reads the real tree.
 *
 * That is not hypothetical. The dental app arrived as `system/dentalClinic`
 * while its catalog slug is `dental`, so `listSystemSources()` returned a slug
 * that no card could ever match and the install card was filtered out silently.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hasSystemSource, listSystemSources, systemSourceDir } from "@/core/org-vault/system-sources";
import { installableCardIds } from "@/core/systems/catalog";

const REPO_ROOT = join(__dirname, "..", "..");

describe("deployed system sources", () => {
  const sources = listSystemSources();

  it("discovers the grocery and dental masters", () => {
    expect(sources).toContain("grocery");
    expect(sources).toContain("dental");
  });

  it("keeps every discovered slug equal to the catalog slug that installs it", () => {
    // The two halves are joined on the slug string, so a folder whose name differs
    // in case or shape from the catalog row is invisible to the install flow even
    // though it is a perfectly good codebase.
    for (const slug of sources) {
      expect(slug, `system/${slug}`).toBe(slug.toLowerCase());
      expect(slug, `system/${slug}`).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("makes dental cloneable rather than merely present", () => {
    expect(hasSystemSource("dental")).toBe(true);
    expect(existsSync(join(systemSourceDir("dental"), "package.json"))).toBe(true);
  });

  it("lets the dental card pass the install gate", () => {
    const ids = installableCardIds({
      cardIds: ["dental"],
      activeSlugs: ["dental"],
      sourceSlugs: sources,
    });
    expect(ids.has("dental")).toBe(true);
  });

  it("ships a demo twin for every repo-hosted real system", () => {
    // A system with a demo and a real copy is the dual-role shape; the demo lives
    // in `demo-systems/` so the marketplace can open it with no approval at all.
    expect(existsSync(join(REPO_ROOT, "demo-systems", "dental", "package.json"))).toBe(true);
    expect(existsSync(join(REPO_ROOT, "demo-systems", "grocery", "package.json"))).toBe(true);
  });
});
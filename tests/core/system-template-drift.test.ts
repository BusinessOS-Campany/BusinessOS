/**
 * A system template and its demo twin are the same application, so `src` must be
 * byte-identical between them.
 *
 * Nothing in the product enforces that. `installSystemForOrg` clones the template,
 * and the demo is served from its own folder, so a fix applied to one is silently
 * absent from the other -- which is exactly what happened to dental on 2026-10-08
 * (the demo ran a 117-file-old copy of the dashboard) and what the grocery pair
 * still carries today.
 *
 * These cases run against a temp folder, so they prove the comparison itself is
 * right. The real trees are read by `scripts/system-template-drift.ts`, which is
 * the part that reports the actual state.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { compareTemplateToDemo } from "../../scripts/system-template-drift";

let root = "";
let templateSrc = "";
let demoSrc = "";

function write(tree: string, rel: string, body: string): void {
  const abs = join(tree, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, body, "utf8");
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "template-drift-"));
  templateSrc = join(root, "template", "src");
  demoSrc = join(root, "demo", "src");
  mkdirSync(templateSrc, { recursive: true });
  mkdirSync(demoSrc, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("compareTemplateToDemo", () => {
  it("reports nothing when both trees hold the same bytes", () => {
    write(templateSrc, "app/page.tsx", "export default 1;");
    write(demoSrc, "app/page.tsx", "export default 1;");

    expect(compareTemplateToDemo(templateSrc, demoSrc)).toEqual({
      onlyTemplate: [],
      onlyDemo: [],
      contentDiffers: [],
    });
  });

  it("names a file the demo is missing, instead of counting it", () => {
    write(templateSrc, "app/api/health/route.ts", "export const GET = 1;");
    write(templateSrc, "app/page.tsx", "export default 1;");
    write(demoSrc, "app/page.tsx", "export default 1;");

    const diff = compareTemplateToDemo(templateSrc, demoSrc);

    expect(diff.onlyTemplate).toEqual(["app/api/health/route.ts"]);
    expect(diff.onlyDemo).toEqual([]);
    expect(diff.contentDiffers).toEqual([]);
  });

  it("distinguishes a file that exists in both but reads differently", () => {
    write(templateSrc, "lib/ttl.ts", "export const TTL = 60;");
    write(demoSrc, "lib/ttl.ts", "export const TTL = 5;");

    expect(compareTemplateToDemo(templateSrc, demoSrc).contentDiffers).toEqual([
      "lib/ttl.ts",
    ]);
  });

  it("ignores generated Prisma output, whose bytes are the client's version and not an edit", () => {
    write(templateSrc, "generated/prisma/client.ts", "version A");
    write(demoSrc, "generated/prisma/client.ts", "version B");
    write(templateSrc, "node_modules/pkg/index.js", "x");
    write(demoSrc, "node_modules/pkg/index.js", "y");

    expect(compareTemplateToDemo(templateSrc, demoSrc)).toEqual({
      onlyTemplate: [],
      onlyDemo: [],
      contentDiffers: [],
    });
  });
});

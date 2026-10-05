import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The platform-admin segment's loading boundary, asserted on source.
 *
 * There is no component-rendering harness in this suite, so — like the approval
 * gate, which asserts on route source — this reads the file. What it protects is
 * not the skeleton's appearance but two facts that are invisible when they break:
 *
 *  1. **The boundary exists.** Without a `loading.tsx` Next has nothing to stream
 *     while a route resolves, so a click keeps displaying the *previous* page for
 *     the whole round trip and the router also prefetches entire pages on hover.
 *     Nothing about that failure is visible in a unit test or in the console; it
 *     only shows up as a console that feels slow.
 *  2. **It carries `aria-busy="true"`.** That attribute is the only machine-readable
 *     signal that the region is a placeholder, and `scripts/platform-admin-nav-check.ts`
 *     settles on its *absence* to decide the page has actually rendered. Replace it
 *     with a spinner and the probe starts timing skeletons as content — silently
 *     reporting a fast click that never delivered a page.
 */
const FILE = join(process.cwd(), "src/app/platform-admin/loading.tsx");

describe("platform-admin loading boundary", () => {
  it("exists and default-exports the segment's loading UI", () => {
    expect(existsSync(FILE)).toBe(true);
    const source = readFileSync(FILE, "utf-8");
    expect(source).toMatch(/export default function/);
  });

  it("marks the placeholder region busy, so assistive tech and the probe can both see it", () => {
    const source = readFileSync(FILE, "utf-8");
    expect(source).toMatch(/aria-busy="true"/);
  });

  it("hard-codes no user-facing text — this segment is Arabic and English", () => {
    const source = readFileSync(FILE, "utf-8");
    // JSX text between tags, outside of quotes: class names live in quotes, so a
    // bare Arabic or English word here would be copy nobody can translate.
    const text = source.replace(/className="[^"]*"/g, "").replace(/\{[^}]*\}/g, "");
    expect(text).not.toMatch(/[\u0600-\u06FF]/);
    expect(text).not.toMatch(/>\s*[A-Za-z][A-Za-z ]*\s*</);
  });
});
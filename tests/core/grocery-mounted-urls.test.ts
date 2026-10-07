import { describe, it, expect, afterEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { appHref, mountedHref, serviceWorkerUrl } from "../../system/grocery/src/lib/app-url";

/**
 * The grocery system runs standalone at `/grocery` and, inside the platform,
 * under each org's mount (`SYSTEM_BASE_PATH=/gm/grocery`). Next normalizes the
 * base path for `next/link`, `redirect()`, `router.*` and `NextResponse.redirect`,
 * but nothing normalizes a URL the app builds by hand: a raw `fetch()` or a plain
 * `<img src>` resolves against the *origin root* and escapes the mount.
 *
 * These tests pin the helper and, more importantly, fail if a hand-built
 * root-absolute URL is reintroduced anywhere in the template.
 */

const TEMPLATE_SRC = join(__dirname, "..", "..", "system", "grocery", "src");

/**
 * `src/proxy.ts` is exempt: Next hands it a basePath-*stripped* `nextUrl.pathname`
 * (hence the bare `PUBLIC_PATHS` comparisons) and re-applies the basePath when it
 * serializes `NextResponse.redirect`. Verified against a live clone:
 * `url.pathname = "/login"` produced `location: /gm/grocery/login`.
 */
const SCAN_SKIP = new Set(["proxy.ts", "next.config.ts"]);

/** Raw `fetch("/api/...")` — resolves against the origin root, not the mount. */
const RAW_FETCH = /\bfetch\(\s*["'`]\\?\/(?!\/)/;

/** Plain `<img>` — bypasses next/image and every Link normalization path. */
const PLAIN_IMG_SRC = /<img[\s\S]{0,400}?\bsrc=\{?\s*["'`]\\?\/(?!\/)/g;

/** Native `<form action>` — a browser submits straight to that literal URL. */
const RAW_FORM_ACTION = /<form[\s\S]{0,400}?\saction=\{?\s*["'`]\\?\/(?!\/)/g;

/**
 * A native GET form whose `action` is a bare identifier (not a mount-aware call
 * and not a server action): `<form method="GET" action={routePath}>`. The browser
 * submits to that path verbatim, escaping the mount. Server-action forms are POST
 * (`action={fn}` with no `method`), so restricting this to GET avoids flagging them.
 */
const RAW_GET_FORM_ACTION =
  /<form[\s\S]{0,400}?method=["']GET["'][\s\S]{0,400}?action=\{\s*([A-Za-z_$][\w$]*)\s*\}/g;

/**
 * A bare root-absolute `/api/` literal, e.g. the body of a URL-builder arrow.
 * Scoped to `/api/` on purpose: an app-route literal is only ever handed to
 * `next/link`, which *does* apply the basePath, so flagging those would be a
 * false positive. An `/api/` literal never goes through `next/link`.
 */
const BARE_API_LITERAL = /^[ \t]*[`'"]\\?\/api\/(?!\/)[^\n]*[`'"]\s*;?[ \t]*$/gm;

/** Markers that already route a path through the mount-aware helpers. */
const MOUNT_AWARE = /mountedHref\(|appHref\(|serviceWorkerUrl\(/;

/** Collects every match of a global regex, leaving `lastIndex` reset. */
const collect = (re: RegExp, source: string): RegExpExecArray[] => {
  const out: RegExpExecArray[] = [];
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) out.push(m);
  re.lastIndex = 0;
  return out;
};

const lineOf = (source: string, index: number): number => source.slice(0, index).split("\n").length;

describe("appHref", () => {
  it("prefixes the mount point", () => {
    expect(appHref("/api/x", "/gm/grocery")).toBe("/gm/grocery/api/x");
  });

  it("is idempotent so an already-prefixed path is not doubled", () => {
    expect(appHref("/gm/grocery/api/x", "/gm/grocery")).toBe("/gm/grocery/api/x");
  });

  it("keeps the query string and fragment outside the prefixing", () => {
    expect(appHref("/api/x?a=1&b=2#f", "/gm/grocery")).toBe("/gm/grocery/api/x?a=1&b=2#f");
  });

  it("leaves absolute and protocol-relative URLs untouched", () => {
    expect(appHref("https://x.test/a", "/gm/grocery")).toBe("https://x.test/a");
    expect(appHref("//cdn.test/a", "/gm/grocery")).toBe("//cdn.test/a");
  });

  it("collapses messy base paths and returns a bare path when unmounted", () => {
    expect(appHref("/api/x", "gm//grocery/")).toBe("/gm/grocery/api/x");
    expect(appHref("/api/x", undefined)).toBe("/api/x");
    expect(appHref("/api/x", "")).toBe("/api/x");
  });

  it("scopes the service worker under the mount", () => {
    expect(serviceWorkerUrl("/gm/grocery")).toBe("/gm/grocery/sw.js");
    expect(serviceWorkerUrl(undefined)).toBe("/sw.js");
  });
});

describe("mountedHref", () => {
  const original = process.env.SYSTEM_BASE_PATH;
  afterEach(() => {
    if (original === undefined) delete process.env.SYSTEM_BASE_PATH;
    else process.env.SYSTEM_BASE_PATH = original;
  });

  it("reads the mount from the environment", () => {
    process.env.SYSTEM_BASE_PATH = "/gm/grocery";
    expect(mountedHref("/api/notifications")).toBe("/gm/grocery/api/notifications");
  });

  it("stays standalone when no mount is set", () => {
    delete process.env.SYSTEM_BASE_PATH;
    expect(mountedHref("/api/notifications")).toBe("/api/notifications");
  });
});

describe("grocery template mount discipline", () => {
  it("builds every hand-written URL through a mount-aware helper", () => {
    const violations: string[] = [];

    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        if (SCAN_SKIP.has(entry.name)) continue;

        const source = readFileSync(full, "utf8");
        const at = (index: number): string =>
          `${relative(TEMPLATE_SRC, full)}:${lineOf(source, index)}`;
        const report = (index: number, match: string): void => {
          // A whole-file match may legitimately span the helper call on the tag.
          if (MOUNT_AWARE.test(match)) return;
          violations.push(at(index));
        };

        source.split("\n").forEach((line, i) => {
          if (MOUNT_AWARE.test(line)) return;
          if (RAW_FETCH.test(line)) {
            violations.push(`${relative(TEMPLATE_SRC, full)}:${i + 1}: raw fetch`);
          }
        });

        for (const m of collect(PLAIN_IMG_SRC, source)) report(m.index, m[0]);
        for (const m of collect(RAW_FORM_ACTION, source)) report(m.index, m[0]);
        for (const m of collect(RAW_GET_FORM_ACTION, source)) {
          violations.push(`${at(m.index)}: unmounted GET form action {${m[1]}}`);
        }
        for (const m of collect(BARE_API_LITERAL, source)) report(m.index, m[0]);
      }
    };

    walk(TEMPLATE_SRC);

    expect(
      violations,
      `Root-absolute URLs escape the mount when served under /<org>/grocery:\n${violations.join("\n")}`,
    ).toEqual([]);
  });
});
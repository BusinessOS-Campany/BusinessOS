import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The service worker is a static file, so it cannot be covered by the unit tests
 * that cover `src/lib`. These assertions exist because the file's two subtleties
 * are both about paths, and both were wrong before:
 *
 *  - a worker is scoped by the directory it is served from, so anything
 *    hardcoded to `/icons/...` or `/_next/...` points at the platform root once
 *    the app is mounted under an org;
 *  - the auth/API skip-list has to match on the app-relative path, or it silently
 *    stops matching and starts caching logged-in HTML.
 */

const SW = readFileSync("system/grocery/public/sw.js", "utf8");

describe("grocery service worker", () => {
  it("derives its mount point from where it is served, not a hardcoded root", () => {
    expect(SW).toMatch(/const MOUNT = self\.location\.pathname/);
    // Every precache entry must be built from MOUNT.
    const precacheBlock = SW.slice(SW.indexOf("function precache"), SW.indexOf('self.addEventListener("install"'));
    for (const asset of [
      "manifest.webmanifest",
      "icons/icon-192.png",
      "icons/icon-512.png",
      "icons/icon-maskable-512.png",
      "icons/apple-touch-icon.png",
    ]) {
      expect(precacheBlock).toContain(asset);
    }
    expect(precacheBlock).not.toMatch(/["'`]\/(icons|manifest)/);
  });

  it("precaches the install shell on install, not lazily", () => {
    expect(SW).toMatch(/addEventListener\("install"[\s\S]*waitUntil\(precache\(\)\)/);
  });

  it("only caches successful precache responses", () => {
    // A cached 404 would leave the installed app permanently without an icon.
    expect(SW).toMatch(/if \(!res\.ok\) return/);
  });

  it("bumps the cache version so old caches are purged on activate", () => {
    const version = SW.match(/const VERSION = "([^"]+)"/)?.[1];
    expect(version).toBeTruthy();
    expect(Number(version!.slice(1))).toBeGreaterThanOrEqual(7);
    expect(SW).toMatch(/caches\.delete\(key\)/);
  });

  it("keeps auth and API routes out of the cache under a mount point", () => {
    expect(SW).toMatch(/NO_CACHE_PATHS\.test\(appRelativePath\(url\.pathname\)\)/);
    expect(SW).toMatch(/if \(MOUNT && !url\.pathname\.startsWith\(MOUNT\)\) return/);
  });

  it("never caches full page HTML", () => {
    // Next error pages return HTTP 200, so a cached navigation serves a stale
    // error screen. Navigations must stay network-only.
    expect(SW).not.toMatch(/text\/html[^\n]*cache\.put|cache\.put\([^\n]*req[^\n]*\)[\s\S]{0,40}text\/html/);
    expect(SW).toMatch(/Page navigations: network-only/);
  });

  it("bypasses the proxy for its own scope only", () => {
    expect(SW).toMatch(/if \(url\.origin !== self\.location\.origin\) return/);
  });
});
import { describe, expect, it } from "vitest";
import {
  IMMUTABLE_ASSET_CACHE,
  systemAssetCacheRules,
} from "@/core/systems/asset-cache";

/**
 * An org's system is a separate Next app behind the platform's proxy, so its
 * hashed `/_next/static` output passes through the platform's own `headers()`
 * rules. Next applies configured headers *after* a route handler has set its
 * own, so the catch-all HTML rule (`no-cache, must-revalidate`) silently
 * overwrote the system's `immutable` and forced every JS/CSS/font byte to be
 * re-fetched from the origin on every navigation — roughly 1 MB for one page.
 *
 * These rules are what stops that, and they are the only place that knows which
 * paths belong to a system, so they are built from the same source-of-truth slug
 * list the rewrites use.
 */
describe("proxied system asset caching", () => {
  it("covers the org-scoped path a system is served at, and the legacy one", () => {
    const rules = systemAssetCacheRules(["grocery"]);

    expect(rules).toEqual([
      {
        source: "/app/:system(grocery)/_next/static/:path*",
        headers: [{ key: "Cache-Control", value: IMMUTABLE_ASSET_CACHE }],
      },
      {
        source: "/:org/:system(grocery)/_next/static/:path*",
        headers: [{ key: "Cache-Control", value: IMMUTABLE_ASSET_CACHE }],
      },
    ]);
  });

  it("constrains the system segment to the slugs that actually exist", () => {
    // An unconstrained `/:org/:system/_next/static/:path*` would hand a year of
    // immutable caching to any path that happens to look like one, so the slug
    // list is the guard.
    for (const rule of systemAssetCacheRules(["grocery"])) {
      expect(rule.source).toContain(":system(grocery)");
    }
  });

  it("folds every known slug into one alternation per path shape", () => {
    const rules = systemAssetCacheRules(["grocery", "sama-center", "grocery"]);

    expect(rules).toHaveLength(2);
    for (const rule of rules) {
      expect(rule.source).toContain("(grocery|sama-center)");
      expect(rule.headers).toEqual([{ key: "Cache-Control", value: IMMUTABLE_ASSET_CACHE }]);
    }
  });

  it("escapes a slug, because a folder name is not a regex", () => {
    const sources = systemAssetCacheRules(["my.system", "a+b"]).map((rule) => rule.source);

    for (const source of sources) {
      expect(source).toContain("my\\.system|a\\+b");
      // A `.` left unescaped would match any character and a `+` would make the
      // alternation quantifier the previous alternative — either silently widens
      // which paths get an immutable year of caching.
      expect(source).not.toContain("(my.system");
      expect(source).not.toContain("(a+b");
    }
  });

  it("produces no rules at all when there are no systems", () => {
    expect(systemAssetCacheRules([])).toEqual([]);
  });

  it("uses the same long TTL the platform already trusts for its own assets", () => {
    expect(IMMUTABLE_ASSET_CACHE).toBe("public, max-age=31536000, immutable");
  });
});

/**
 * Cache policy for a proxied org system's own static assets.
 *
 * An org's system is a separate Next app running in its own process behind the
 * platform's proxy, so its hashed `/_next/static` output is served *by the
 * platform*. The platform's `headers()` config is what stamps `Cache-Control`
 * on the way out, and Next applies those configured headers after a route
 * handler has set its own — so the catch-all HTML rule
 * (`no-cache, must-revalidate`) silently overwrote the system's own
 * `public, max-age=31536000, immutable`.
 *
 * The effect was invisible in code and expensive in the field: every chunk,
 * stylesheet and font of the system was re-fetched from the origin on every
 * navigation, which for one grocery page is around a megabyte.
 *
 * Dependency-free on purpose — `next.config.ts` imports this to build the table,
 * and that file is loaded before the app's module graph exists.
 */

/** The TTL Next already stamps on hashed output, reused verbatim for systems. */
export const IMMUTABLE_ASSET_CACHE = "public, max-age=31536000, immutable";

export interface HeaderRule {
  source: string;
  headers: { key: string; value: string }[];
}

/**
 * Escapes a slug for use inside a `:param(a|b)` alternation.
 *
 * The slugs come from folder names on disk, so they are not guaranteed to be
 * regex-safe: an unescaped `.` matches any character and an unescaped `+`
 * quantifies the alternative before it, both of which would hand immutable
 * caching to paths that are not the system's assets.
 */
function escapeSlug(slug: string): string {
  return slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Immutable-cache rules for every system's own static assets, at both the
 * org-scoped path a system is served at (`/{org}/{system}`) and the legacy
 * `/app/{system}` one.
 *
 * The `:system` segment is constrained to the slugs that actually have a source
 * folder, so no unrelated path can inherit a year of caching.
 */
export function systemAssetCacheRules(slugs: readonly string[]): HeaderRule[] {
  const known = [...new Set(slugs.filter(Boolean))];
  if (known.length === 0) return [];

  const alternation = known.map(escapeSlug).join("|");
  const headers = [{ key: "Cache-Control", value: IMMUTABLE_ASSET_CACHE }];

  return [
    { source: `/app/:system(${alternation})/_next/static/:path*`, headers },
    { source: `/:org/:system(${alternation})/_next/static/:path*`, headers },
  ];
}

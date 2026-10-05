import { isReservedOrgSlug, isValidOrgSlug } from "./org-route";

/**
 * Turning a human name into a URL segment that can actually be routed.
 *
 * A slug is not cosmetic here. It is the `/{org}` path segment *and* the stem
 * of the per-org database and schema names, so it has to satisfy
 * `isValidOrgSlug`: lowercase ASCII alphanumerics and dashes only.
 *
 * That constraint is why this module exists rather than a `name.replace()`
 * inline. Sign-in now provisions an org from the *Google display name*, and
 * those names are routinely Arabic ("محمد"), CJK, or emoji. The slugifier that
 * was in use kept `\u0600-\u06FF`, so an Arabic name produced a slug like
 * `محمد-علي`: `isValidOrgSlug` rejects it, the `/{org}` dynamic route never
 * matches, and the org that was just created for the user is permanently
 * unreachable at its own URL - 404 on their own business, with no way to
 * recover except the session's `activeOrganizationId`. The org row is fine and
 * the page is broken, which is the worst possible failure shape.
 *
 * So: the *name* keeps the user's real name in any script (it is display text),
 * and only the *slug* is forced to ASCII, with a deterministic fallback derived
 * from the name/email so the same person always gets the same URL.
 */

/** `isValidOrgSlug` caps the segment at 63 characters; stay clear of the edge. */
const MAX_SLUG_LENGTH = 63;

/** Used when a name yields no usable ASCII and no usable seed. */
const FALLBACK_PREFIX = "org";

/** Names this long are truncated; a readable URL beats a complete one. */
const DEFAULT_MAX_LENGTH = 40;

export interface OrgSlugOptions {
  /**
   * Second source for the slug, used only when the name has no ASCII in it.
   * An email local part is the natural seed: it is usually ASCII even when the
   * display name is not, and it produces a URL a human can recognise.
   */
  seed?: string | null;
  /**
   * Leading segment, e.g. a template code, so a template-driven org is
   * identifiable from the URL. Applied *before* the reserved-word and length
   * checks, so the composition can never produce an unroutable segment.
   */
  prefix?: string | null;
  maxLength?: number;
}

/**
 * Builds a slug that is guaranteed to satisfy `isValidOrgSlug`.
 *
 * Guarantees, all of which are covered by tests: lowercase, ASCII, no leading
 * or trailing dash, within the length cap, and not one of the app's own route
 * segments (an org called "Systems" must not shadow `/systems`).
 */
export function slugifyOrgName(
  input: string | null | undefined,
  options: OrgSlugOptions = {},
): string {
  const maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH;
  const raw = typeof input === "string" ? input.trim() : "";

  // Candidate order: the name itself, then the seed (email), then a hash of
  // whichever we already have. A name that is entirely non-Latin still gets a
  // stable, distinct URL rather than colliding on one shared "business" slug.
  const candidates = [
    raw,
    typeof options.seed === "string" ? options.seed : "",
    raw || typeof options.seed === "string" ? options.seed || raw : "",
  ];

  let slug = "";
  for (const candidate of candidates) {
    slug = asciiSlug(candidate, maxLength);
    if (slug) break;
  }
  if (!slug) slug = `${FALLBACK_PREFIX}-${fnv1a(raw || "org")}`;

  if (options.prefix) {
    slug = asciiSlug(`${options.prefix}-${slug}`, maxLength);
    if (!slug) slug = `${FALLBACK_PREFIX}-${fnv1a(raw || options.prefix!)}`;
  }

  // Length capping and the prefix can still leave a shape the router rejects,
  // so normalise once more, then defend the invariants explicitly.
  slug = capSlug(slug, maxLength);
  // Reserved names and bare numbers are routable but *wrong*: an org called
  // "Systems" would shadow the app's own /systems route, and "404" reads like a
  // row id. Both are namespaced instead of being hashed away, so the URL stays
  // recognisable. This must come before the validity fallback below, because a
  // reserved slug is exactly the case `isValidOrgSlug` rejects for a good
  // reason that a hash would throw away.
  if (isReservedOrgSlug(slug) || /^\d+$/.test(slug)) {
    slug = capSlug(`${FALLBACK_PREFIX}-${slug}`, maxLength);
  }
  if (!isValidOrgSlug(slug)) {
    slug = `${FALLBACK_PREFIX}-${fnv1a(raw || slug)}`;
  }
  return slug;
}

/** Trims to a length without leaving a trailing dash behind. */
export function capSlug(slug: string, maxLength: number = MAX_SLUG_LENGTH): string {
  return slug.slice(0, maxLength).replace(/-+$/, "");
}

/**
 * Appends a counter until the slug is free.
 *
 * The lookup is injected rather than importing Prisma so this stays a pure,
 * trivially testable helper and so the caller controls the transaction/client.
 * A random suffix is the last resort only: two people legitimately named
 * "Ahmed" should get `ahmed` and `ahmed-2`, not two unguessable URLs.
 */
export async function ensureUniqueOrgSlug(
  findBySlug: (slug: string) => Promise<unknown>,
  base: string,
): Promise<string> {
  if (!(await findBySlug(base))) return base;
  for (let suffix = 2; suffix <= 50; suffix++) {
    const candidate = capSlug(`${base}-${suffix}`);
    if (candidate !== base && !(await findBySlug(candidate))) return candidate;
  }
  return capSlug(`${base}-${Date.now().toString(36)}`);
}

/** ASCII-only slug body, or "" when the text has no usable ASCII in it. */
function asciiSlug(input: string, maxLength: number): string {
  if (!input) return "";
  // NFKD splits accented Latin into base letter + combining mark, so "José"
  // reduces to "jose" instead of losing the letter. Arabic harakat are stripped
  // for the same reason; the base letters are dropped separately as non-ASCII.
  const folded = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036F\u064B-\u0652\u0670]/g, "")
    .toLowerCase()
    // Drop apostrophes entirely: "o'brien" is a nicer slug than "o-brien".
    .replace(/['\u2019\u02bc]/g, "")
    .replace(/[^a-z0-9]+/g, "-");
  return capSlug(folded, maxLength);
}

/**
 * FNV-1a, 32-bit. Used only to make a fallback slug stable for a given name,
 * so the same person keeps the same URL across retries. Not security-relevant.
 */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/**
 * URL construction for a proxied org system.
 *
 * An org's system is served under the org — `/{org}/{system}` — and that one
 * path is three things at once:
 *
 *  - the URL the customer sees and can link to;
 *  - the child process's own `basePath`, so its links and its `/_next/static`
 *    URLs come out correct with no rewriting on our side;
 *  - part of the key the runtime is registered under, so a system can never be
 *    reached at a basePath it was not started with.
 *
 * Both builders live here so nothing else interpolates these by hand.
 */

/** A URL path segment: no separators, no traversal, no query or fragment. */
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

function requireSegment(value: string, label: string): string {
  if (!SEGMENT.test(value)) {
    throw new Error(`Invalid ${label} for an org system path: ${JSON.stringify(value)}`);
  }
  return value;
}

/**
 * Where an org's own copy of a system is served, and where its process is told
 * to mount itself.
 */
export function orgSystemPath(orgSlug: string, systemSlug: string): string {
  return `/${requireSegment(orgSlug, "org slug")}/${requireSegment(systemSlug, "system slug")}`;
}

/** What the runtime object needs to expose for the upstream URL to be built. */
export interface SystemTarget {
  origin: string;
  basePath: string;
}

/**
 * The URL on the runtime that serves one proxied request.
 *
 * `segments` is the path below the system's root and `search` the incoming query
 * string; both are passed through untouched, because the customer's system
 * decides what those paths mean.
 */
export function systemUpstreamUrl(target: SystemTarget, segments: readonly string[], search: string): string {
  const path = segments.length > 0 ? `${target.basePath}/${segments.join("/")}` : target.basePath;
  return `${target.origin}${path}${search}`;
}

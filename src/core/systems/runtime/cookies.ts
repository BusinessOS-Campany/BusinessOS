import { cookies } from "next/headers";

/**
 * Hands a proxied system's own session cookie to the browser.
 *
 * A system the platform proxies keeps its own session, so the platform has to
 * relay that cookie rather than let the browser talk to the system directly. The
 * cookie is relayed whole: its lifetime, scope and flags are the system's
 * decision, and rewriting them here is how a working sign-in turns into a loop.
 *
 * ## Why the attributes are parsed rather than dropped
 *
 * This used to rebuild each cookie from its name and value alone. That is
 * invisible for a healthy session and fatal for an unhealthy one: the grocery
 * system answers a refused session with
 * `gs_session=; Expires=Thu, 01 Jan 1970 00:00:00 GMT`, and a relay that drops
 * `Expires` re-emits that as `gs_session=; Path=/; HttpOnly` — an *empty cookie
 * that never expires*. The browser keeps it, the platform then sees `gs_session=`
 * on every later request and concludes the caller is already signed in, so it
 * never calls the link route again. The member is bounced to
 * `/{org}/grocery/login?next=/dashboard` for the rest of the browser session, and
 * no amount of retrying helps because the thing being retried is never run.
 *
 * A deletion is therefore relayed as a deletion, and everything else is relayed
 * exactly as the system asked for it.
 *
 * Lives outside the route modules because Next restricts what a route module may
 * export, and the root route, the catch-all route and the legacy `/app/<system>`
 * routes all need to call it.
 */

/** One upstream `Set-Cookie`, read into the parts that decide browser behaviour. */
export interface RelayedCookie {
  name: string;
  value: string;
  /** The path the cookie is scoped to. A deletion must repeat it exactly. */
  path: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax" | "strict" | "none";
  /** From `Expires`, or null when the header carried none. */
  expires: Date | null;
  /** From `Max-Age`, in seconds, or null when the header carried none. */
  maxAge: number | null;
  /**
   * True when the system asked for the cookie to be removed — an empty value
   * with an expiry in the past, or a non-positive `Max-Age`.
   *
   * An empty value on its own is NOT a deletion: some systems use "" as a real
   * value, and treating it as one would log the member out of a system that never
   * asked them to leave.
   */
  remove: boolean;
}

/** Reads one attribute's value, case-insensitively. */
function attribute(attributes: string[], name: string): string | null {
  const prefix = `${name.toLowerCase()}=`;
  for (const part of attributes) {
    const trimmed = part.trim();
    if (trimmed.toLowerCase().startsWith(prefix)) return trimmed.slice(prefix.length).trim();
  }
  return null;
}

/** True when the header names the attribute at all, whatever its value. */
function hasAttribute(attributes: string[], name: string): boolean {
  const lower = name.toLowerCase();
  return attributes.some((part) => {
    const trimmed = part.trim().toLowerCase();
    return trimmed === lower || trimmed.startsWith(`${lower}=`);
  });
}

function readSameSite(raw: string | null): "lax" | "strict" | "none" {
  const value = raw?.toLowerCase();
  return value === "strict" || value === "none" ? value : "lax";
}

/**
 * Reads one upstream `Set-Cookie` into the cookie the browser should end up with.
 *
 * Returns null for a header that carries no `name=value` pair, because half a
 * cookie is worse than none: the browser would store a nameless value and the
 * session would appear to exist while never being sent back.
 */
export function parseSetCookie(setCookie: string): RelayedCookie | null {
  const [pair, ...rest] = setCookie.split(";");
  if (pair === undefined) return null;

  const eq = pair.indexOf("=");
  if (eq <= 0) return null;

  const name = pair.slice(0, eq).trim();
  if (!name) return null;

  const rawMaxAge = attribute(rest, "max-age");
  const maxAge = rawMaxAge !== null && /^-?\d+$/.test(rawMaxAge) ? Number(rawMaxAge) : null;

  const rawExpires = attribute(rest, "expires");
  let expires: Date | null = null;
  if (rawExpires) {
    const parsed = new Date(rawExpires);
    // An unparseable Expires is not a lifetime and not a deletion: the cookie
    // keeps whatever other attribute decides its life.
    if (!Number.isNaN(parsed.getTime())) expires = parsed;
  }

  // RFC 6265: Max-Age takes precedence over Expires. Either one already in the
  // past means the system is removing the cookie.
  const remove =
    maxAge !== null ? maxAge <= 0 : expires !== null && expires.getTime() <= Date.now();

  return {
    name,
    value: pair.slice(eq + 1).trim(),
    path: attribute(rest, "path") ?? "/",
    httpOnly: hasAttribute(rest, "httponly"),
    secure: hasAttribute(rest, "secure"),
    sameSite: readSameSite(attribute(rest, "samesite")),
    expires,
    maxAge,
    remove,
  };
}

/**
 * Whether a proxied response is the system sending the caller to its own login
 * page or to the route that drops a dead session.
 *
 * The platform is the only party that can repair this: it has already proven the
 * caller is a member of the org, and it holds the link route the system trusts.
 * So recognising the bounce lets it re-link and retry instead of showing a
 * second sign-in form to somebody who is already signed in.
 *
 * Scoped to this system's own mount, so `/{otherOrg}/{system}/login` — a path
 * this runtime never serves — is not mistaken for it.
 */
export function isSystemLoginRedirect(
  response: { status: number; location: string | null },
  basePath: string,
): boolean {
  if (response.status < 300 || response.status >= 400) return false;
  if (!response.location) return false;

  let path: string;
  try {
    // The clone may answer with a relative path or with an absolute URL, and the
    // same mount has to be recognised either way.
    path = new URL(response.location, "http://system.invalid").pathname;
  } catch {
    return false;
  }

  const loginPath = `${basePath}/login`;
  const expirePath = `${basePath}/api/auth/expire`;
  return path === loginPath || path.startsWith(`${loginPath}/`) || path === expirePath;
}

/** Writes one relayed cookie onto the response, deletion included. */
async function applyCookie(setCookie: string): Promise<void> {
  const parsed = parseSetCookie(setCookie);
  if (!parsed) return;

  const jar = await cookies();
  if (parsed.remove) {
    // Expressed as an expiry rather than `delete`, because a deletion has to
    // name the same Path the cookie was issued with — `delete(name)` alone would
    // only remove it from `/` and leave the scoped copy in place.
    jar.set(parsed.name, "", { path: parsed.path, expires: new Date(0), maxAge: 0 });
    return;
  }

  jar.set(parsed.name, parsed.value, {
    path: parsed.path,
    httpOnly: parsed.httpOnly,
    secure: parsed.secure,
    sameSite: parsed.sameSite,
    ...(parsed.expires ? { expires: parsed.expires } : {}),
    ...(parsed.maxAge !== null ? { maxAge: parsed.maxAge } : {}),
  });
}

/**
 * Passes the system's own cookies on to the browser, intact.
 *
 * Without this the customer would be asked to sign in again on every request.
 */
export async function relayCookies(setCookies: string[]): Promise<void> {
  if (setCookies.length === 0) return;
  for (const cookie of setCookies) {
    await applyCookie(cookie);
  }
}
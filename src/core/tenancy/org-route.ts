import { sharedPrisma } from "@/core/db/client";

/**
 * Org-in-the-URL resolution for the `/{orgSlug}/...` route tree.
 *
 * The org was previously carried only by the `Host` header and the session's
 * `activeOrganizationId`, so `/haitham/profile` and `/otherco/profile` were the
 * same page and there was no way to see (or link to) which org you were in. This
 * module makes the URL authoritative while keeping the session as the storage
 * location the rest of the app already reads from.
 *
 * Two rules are load-bearing:
 *
 *  1. **"Not a member" and "no such org" are the same answer.** Returning 404
 *     for both is what stops `/{slug}/profile` from becoming an org-enumeration
 *     oracle. A distinct 403 would confirm the slug exists.
 *  2. **Membership is read from the platform registry, never from the URL.** The
 *     slug is only ever used to *find* the org; the actual authorization is
 *     always a `member` row for the caller's user id.
 */

/**
 * First URL segments the application itself owns. A `/{orgSlug}` tree sits at
 * the top level, and Next resolves static segments before dynamic ones, so an
 * org whose slug matched one of these would have an unreachable URL — the
 * request would land on the app's own route instead of the org's.
 *
 * Kept in sync with the real `src/app` top-level segments.
 */
export const RESERVED_ORG_SLUGS: ReadonlySet<string> = new Set([
  "_next",
  "api",
  "app",
  "apps",
  "auth",
  "favicon.ico",
  "my-apps",
  "platform-admin",
  "profile",
  "robots.txt",
  "select-org",
  "signin",
  "signup",
  "systems",
]);

/** Mirrors the slugs Better Auth will accept, tightened for URL safety. */
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function isValidOrgSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && !isReservedOrgSlug(slug);
}

export function isReservedOrgSlug(slug: string): boolean {
  return RESERVED_ORG_SLUGS.has(slug.toLowerCase());
}

/** The org's landing page. */
export function orgHomePath(slug: string): string {
  return `/${slug}/my-apps`;
}

export function orgProfilePath(slug: string): string {
  return `/${slug}/profile`;
}

/** Org statuses that must not render an org page at all. */
const UNUSABLE_ORG_STATUSES: ReadonlySet<string> = new Set([
  "pending",
  "suspended",
  "cancelled",
  "rejected",
]);

export interface OrgScopeOrganization {
  id: string;
  slug: string;
  name: string;
  logo: string | null;
  status: string;
}

export type OrgScopeResult =
  /** Unknown slug, reserved slug, or the caller is not a member. All identical. */
  | { kind: "not-found" }
  /** The caller IS a member, but the org is pending/suspended/etc. */
  | { kind: "inactive"; status: string; organization: OrgScopeOrganization }
  | { kind: "ok"; organization: OrgScopeOrganization; role: string };

const ORG_SELECT = { id: true, slug: true, name: true, logo: true, status: true } as const;

/**
 * Resolves `/{orgSlug}` for a signed-in user.
 *
 * Platform admins are deliberately NOT special-cased here: this is the customer
 * org surface, and an admin is only a member if they actually hold a member row.
 * Their cross-org access lives in `/platform-admin`, which is gated separately.
 */
export async function resolveOrgScope(slug: string, userId: string): Promise<OrgScopeResult> {
  if (!slug || isReservedOrgSlug(slug)) return { kind: "not-found" };

  const org = await sharedPrisma.organization.findUnique({
    where: { slug },
    select: ORG_SELECT,
  });
  if (!org) return { kind: "not-found" };

  // findFirst rather than findUnique: the membership check must not depend on a
  // compound-unique index existing, and this path is not hot.
  const member = await sharedPrisma.member.findFirst({
    where: { organizationId: org.id, userId },
    select: { role: true },
  });
  if (!member) return { kind: "not-found" };

  if (UNUSABLE_ORG_STATUSES.has(org.status)) {
    return { kind: "inactive", status: org.status, organization: org };
  }
  return { kind: "ok", organization: org, role: member.role };
}

/**
 * Validates a `?next=` value for a post-auth redirect.
 *
 * The only safe shape is a same-origin absolute *path*. Everything that makes a
 * redirect open — a scheme, a protocol-relative `//host`, a backslash that some
 * parsers normalise to `/`, or control characters — is rejected outright rather
 * than escaped, because this value is attacker-supplied.
 *
 * `allowedOrgSlugs` are the caller's own orgs. A `/{slug}` target naming any
 * other slug is refused, so a crafted link cannot bounce someone into a page
 * they would then be denied anyway.
 *
 * Returns the safe path, or null when the input must not be used.
 */
export function safeNext(
  next: string | null | undefined,
  allowedOrgSlugs: readonly string[] = [],
): string | null {
  if (typeof next !== "string") return null;
  const value = next.trim();
  if (!value.startsWith("/")) return null;
  // "//evil.com" and "/\evil.com" are absolute URLs to several parsers.
  if (value.startsWith("//") || value.startsWith("/\\")) return null;
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return null;
  // A colon before the first slash is a scheme ("/javascript:..." etc).
  // The search must start *after* the leading slash, otherwise it matches index
  // 0 and every path yields an empty first segment.
  const rest = value.slice(1);
  const relEnd = rest.search(/[/?#]/);
  const firstSegment = relEnd === -1 ? rest : rest.slice(0, relEnd);
  if (!firstSegment) return null;
  if (firstSegment.includes(":")) return null;
  if (isReservedOrgSlug(firstSegment)) return value;
  if (allowedOrgSlugs.includes(firstSegment)) return value;
  return null;
}

/**
 * Where a user with no organization is sent, and where one gets created.
 *
 * This used to resolve to `/select-org`, which is a dead end: the picker renders
 * an empty list plus a "create one from the control panel" line, and no such
 * control exists. Google sign-in hit this every time — the social callback goes
 * to `/auth/landing`, which only *routes*, and a first-time Google user has no
 * membership row, so their first authenticated page was a chooser with nothing
 * in it. Provisioning is the only way out, and it belongs in the post-auth path
 * so every provider lands somewhere real.
 */
export const ORG_PROVISION_PATH = "/auth/complete-org";

/**
 * Where a platform admin (`user.role === "admin"`) lands.
 *
 * Admins hold a `member` row in a real customer org, so the org branches below
 * would happily send one to `/{that-org}/profile` — a page about someone else's
 * business. Their work lives in the console, so this is checked before any org
 * rule, including the "no orgs" one: an admin with zero memberships is not a
 * candidate for org provisioning, they just need the console.
 */
export const PLATFORM_ADMIN_PATH = "/platform-admin";

/**
 * Where a user should land after signing in, given their memberships.
 *
 * Precedence: a platform admin (the console), then no org at all (provision one),
 * then an explicit validated `next`, then a single org (the whole point of the
 * request — do not make one-org users click through a picker), then the picker
 * for genuine multi-org users.
 *
 * The single-org answer is the org's apps catalog, not its profile page. An org
 * is a collection of the systems it installed, so the catalog is the only page
 * that can be right for every org: one that has installed nothing needs to be
 * told what it can install, and one that has installed three needs to pick
 * between them. The profile page is a settings form and says nothing about
 * either.
 *
 * The admin case comes first deliberately. An explicit `next` still wins over
 * it, because a link an admin was actually sent to is a real intent — a console
 * shortcut must not swallow `/platform-admin/tenants/abc`.
 *
 * The no-org case is checked before `next` on purpose, and `next` is
 * deliberately not carried into provisioning. `safeNext` permits app-level paths
 * like `/profile` without any org, so honouring a deep link first would drop a
 * brand-new user onto a protected surface they cannot use; and an org-scoped
 * deep link is unsatisfiable by construction, because the slug that would make
 * it valid is the one being created and the user cannot have known it. Preserving
 * it would only defer the drop to after the org exists.
 */
export function postSignInPath(options: {
  next?: string | null;
  orgSlugs: readonly string[];
  isPlatformAdmin?: boolean;
}): string {
  if (options.isPlatformAdmin) {
    return safeNext(options.next, options.orgSlugs) ?? PLATFORM_ADMIN_PATH;
  }
  if (options.orgSlugs.length === 0) return ORG_PROVISION_PATH;
  const forwarded = safeNext(options.next, options.orgSlugs);
  if (forwarded) return forwarded;
  if (options.orgSlugs.length === 1) return orgHomePath(options.orgSlugs[0]);
  return "/select-org";
}

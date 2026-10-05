import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/core/auth/server";
import { resolveOrgScope } from "@/core/tenancy/org-route";
import type { SystemRequestScope } from "./proxy";
import { orgSystemPath } from "./urls";

/**
 * Turns a `/{org}/{system}` request into the caller the proxy forwards on behalf
 * of.
 *
 * `src/app/[org]/layout.tsx` already does this for every *page* under the org
 * tree, but a `route.ts` is a terminal endpoint and does not run the layouts
 * above it — so the org in the URL has to be resolved and authorized here, or
 * `/ajwad/grocery` would boot a runtime without ever checking that the caller
 * belongs to Ajwad.
 *
 * The rules are the layout's, unchanged, because they are the ones that make the
 * org URL safe:
 *
 *  - "no such org" and "not your org" are the same answer, so the path cannot be
 *    used to discover which org slugs exist;
 *  - membership is read from the platform registry, never from the URL; the slug
 *    only ever *finds* the org.
 */

export type SystemScopeResult =
  | { kind: "ok"; scope: SystemRequestScope }
  /** No platform session. */
  | { kind: "unauthenticated" }
  /** Unknown slug, reserved slug, or the caller is not a member. */
  | { kind: "not-found" }
  /** A member, but the org cannot be served (pending/suspended/…). */
  | { kind: "inactive"; status: string };

export async function resolveSystemRequestScope(orgSlug: string): Promise<SystemScopeResult> {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) return { kind: "unauthenticated" };

  const scope = await resolveOrgScope(orgSlug, session.user.id);
  if (scope.kind === "not-found") return { kind: "not-found" };
  if (scope.kind === "inactive") return { kind: "inactive", status: scope.status };

  return {
    kind: "ok",
    scope: {
      organizationId: scope.organization.id,
      organizationSlug: scope.organization.slug,
      organizationName: scope.organization.name,
      userId: session.user.id,
      role: scope.role,
      email: session.user.email ?? "",
      name: session.user.name ?? "",
    },
  };
}

/**
 * A 307 whose `Location` is a path and nothing else.
 *
 * `NextResponse.redirect` requires an absolute URL, so it has to be handed a base
 * — and the only base available is `request.url`, which behind the tunnel
 * describes the platform's own origin rather than the host the visitor typed.
 * That produced `307 Location: https://localhost:3100/signin?next=...`: a public
 * scheme on a loopback host, which no browser can open, so clicking an app while
 * signed out dead-ended on a connection error instead of showing the sign-in
 * form. A path-only `Location` is equally valid per RFC 9110 and the browser
 * resolves it against the address bar, so the answer is identical on every
 * hostname.
 */
function relativeRedirect(path: string): Response {
  return new NextResponse(null, { status: 307, headers: { location: path, "cache-control": "no-store" } });
}

/**
 * The response for a scope that is not `ok`.
 *
 * Both `/{org}/{system}` route handlers funnel through this so the system root
 * and everything under it answer identically — a deep link must not be usable
 * as a probe for orgs the caller cannot see.
 *
 * There is deliberately no `request` parameter: nothing here may read it, and
 * making that structural is what stops the origin leak above from coming back.
 */
export function respondToScopeProblem(
  problem: Exclude<SystemScopeResult, { kind: "ok" }>,
  orgSlug: string,
  systemSlug: string,
): Response {
  if (problem.kind === "unauthenticated") {
    // `orgSystemPath` validates both segments, so a slug that would climb out of
    // the origin throws here rather than escaping into the `next` value.
    const next = encodeURIComponent(orgSystemPath(orgSlug, systemSlug));
    return relativeRedirect(`/signin?next=${next}`);
  }
  if (problem.kind === "inactive") {
    const status = encodeURIComponent(problem.status);
    return relativeRedirect(`/select-org?status=${status}`);
  }
  return new NextResponse(null, { status: 404, headers: { "cache-control": "no-store" } });
}

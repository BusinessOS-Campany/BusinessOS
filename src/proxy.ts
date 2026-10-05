import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/core/auth/server";
import { sharedPrisma } from "@/core/db/client";
import { isPlatformDomain, tenantSlugFromHost } from "@/core/tenancy/host";
import { grocerySchemaName } from "@/core/tenancy/schemas";
import { issueGroceryGatewayToken } from "@/core/auth/grocery-gateway";
import { DEMO_SYSTEMS } from "@/core/demo/demo-systems";

/**
 * Security headers applied to every response. CSP is report-only in
 * development so it doesn't block inline scripts from dev tooling.
 */
const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-XSS-Protection": "0",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
};

/* Domains required by the Sketchfab 3D-model viewer embed */
const SKETCHFAB = [
  "sketchfab.com",
  "*.sketchfab.com",
  "static.sketchfab.com",
  "*.static.sketchfab.com",
  "*.s3.amazonaws.com",
  "*.cloudfront.net",
].join(" ");

/**
 * Cloudflare Web Analytics, injected at the edge into every HTML response.
 *
 * The browser console reported a CSP violation for `beacon.min.js` on every
 * page, which reads as a broken site to anyone with devtools open — and it
 * means the RUM data is not being collected either. Cloudflare adds the tag
 * server-side, so the policy has to name it; there is no tag to remove here.
 */
const CLOUDFLARE_INSIGHTS = [
  "static.cloudflareinsights.com",
  "cloudflareinsights.com",
  "*.cloudflareinsights.com",
].join(" ");
const FRAME_SRC = [
  "sketchfab.com",
  "*.sketchfab.com",
  "static.sketchfab.com",
  "*.static.sketchfab.com",
].join(" ");

const CSP_DIRECTIVES = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${SKETCHFAB} ${CLOUDFLARE_INSIGHTS}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${SKETCHFAB}`,
  "font-src 'self' data:",
  `connect-src 'self' ${SKETCHFAB} ${CLOUDFLARE_INSIGHTS}`,
  `frame-src 'self' ${FRAME_SRC}`,
  `child-src ${FRAME_SRC}`,
  `worker-src 'self' ${FRAME_SRC}`,
  "base-uri 'self'",
  "form-action 'self'",
  "media-src 'self' blob:",
].join("; ");

const STATIC_SUFFIX = /\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?|ttf|eot|map)$/;

/**
 * Mints the grocery gateway token for a signed-in user hitting a `/grocery/*`
 * path and forwards it two ways so the standalone grocery app (reverse-proxied
 * same-origin through the `beforeFiles` rewrites) can open an isolated
 * connection to the tenant's `grocery_<slug>` schema on the shared server:
 *
 *  1. `x-bos-gateway-token` request header — read by the grocery app's server
 *     code (`apps/grocery/src/shared/db.ts`) and propagated by Next to rewrite
 *     destinations.
 *  2. `bos_grocery` HTTP-only cookie (scoped to `/grocery`, 5-minute expiry) —
 *     carried by the browser on subsequent grocery requests.
 *
 * Host-based tenant resolution wins (subdomain/custom domain); otherwise the
 * session's active organization is used. Platform admins and unauthenticated
 * users get no token. Fails soft — grocery pages must load without one.
 */
async function attachGroceryGatewayToken(
  request: NextRequest,
  requestHeaders: Headers,
  response: NextResponse,
): Promise<void> {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.session || session.user.role === "admin") return;

    let orgId: string | null = null;
    let slug: string | null = null;

    const host = request.headers.get("host");
    if (host) {
      const hostname = host.split(":")[0].toLowerCase();
      if (isPlatformDomain(hostname)) {
        slug = tenantSlugFromHost(host);
        if (slug) {
          const org = await sharedPrisma.organization.findUnique({
            where: { slug },
            select: { id: true },
          });
          if (org) orgId = org.id;
        }
      } else {
        const org = await sharedPrisma.organization.findFirst({
          where: { settings: { path: ["domains"], array_contains: [hostname] } },
          select: { id: true, slug: true },
        });
        if (org) {
          orgId = org.id;
          slug = org.slug;
        }
      }
    }

    if (!orgId || !slug) {
      const activeOrgId = session.session.activeOrganizationId;
      if (!activeOrgId) return;
      const org = await sharedPrisma.organization.findUnique({
        where: { id: activeOrgId },
        select: { id: true, slug: true },
      });
      if (!org) return;
      orgId = org.id;
      slug = org.slug;
    }

    const member = await sharedPrisma.member.findFirst({
      where: { organizationId: orgId, userId: session.user.id },
      select: { role: true },
    });
    if (!member) return;

    // Schema only: the token names `grocery_<slug>`, never a database.
    const token = issueGroceryGatewayToken({
      organizationId: orgId,
      userId: session.user.id,
      role: member.role,
      schemaName: grocerySchemaName(slug),
    });

    requestHeaders.set("x-bos-gateway-token", token);
    response.cookies.set("bos_grocery", token, {
      httpOnly: true,
      sameSite: "lax",
      // Scoped to the mount the grocery app is served under, so the cookie is
      // not sent to every other app on the origin. Read from the registry
      // rather than written here, since that path moves with the app.
      path: GROCERY_MOUNT,
      maxAge: 300,
      secure: request.nextUrl.protocol === "https:",
    });
  } catch {
    // Fail soft: the grocery app works without a token when unsigned.
  }
}

/**
 * Public mounts of the proxied demo systems, from the registry. This middleware
 * runs before the rewrite, so `pathname` is the public path and must be matched
 * against these rather than against the sub-apps' own basePath literals.
 */
const DEMO_MOUNTS: readonly string[] = DEMO_SYSTEMS.map((system) => system.rootPath);
const GROCERY_MOUNT = DEMO_SYSTEMS.find((s) => s.slug === "grocery")!.rootPath;

/** True when `pathname` is a demo mount or something beneath it. */
const isDemoPath = (pathname: string): boolean =>
  DEMO_MOUNTS.some((mount) => pathname === mount || pathname.startsWith(`${mount}/`));

/**
 * Edge middleware (Next.js 16 `proxy` convention — replaces legacy
 * middleware.ts). Attaches/propagates a request id, sets security headers,
 * and mints the grocery gateway token for the grocery rewrite.
 */
export async function proxy(request: NextRequest) {
  const requestId =
    request.headers.get("x-request-id") ??
    globalThis.crypto.randomUUID();

  const { pathname } = request.nextUrl;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);

  // `Next-Url` is one of the four values a client-side navigation hashes into
  // its `_rsc` parameter. Next deletes the header from the request before a
  // route handler runs, so it is parked here — still readable at this point —
  // for the runtime proxy to put back on the way to the system behind us.
  const nextUrl = request.headers.get("next-url");
  if (nextUrl) requestHeaders.set("x-bos-next-url", nextUrl);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("x-request-id", requestId);

  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    if (isDemoPath(pathname) && key === "X-Frame-Options") {
      response.headers.set(key, "SAMEORIGIN");
      continue;
    }
    response.headers.set(key, value);
  }

  const isDev = process.env.NODE_ENV === "development";
  response.headers.set(
    "Content-Security-Policy",
    isDev ? `${CSP_DIRECTIVES}; report-uri /api/csp-report` : CSP_DIRECTIVES,
  );

  // Grocery pages are reverse-proxied from the standalone grocery app; give it
  // a short-lived tenant token so it can reach the tenant's database. Skip
  // asset paths to keep the token minting off the hot static path.
  if (
    (pathname === GROCERY_MOUNT || pathname.startsWith(`${GROCERY_MOUNT}/`)) &&
    !pathname.includes("/_next/") &&
    !STATIC_SUFFIX.test(pathname)
  ) {
    await attachGroceryGatewayToken(request, requestHeaders, response);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
import { NextResponse, type NextRequest } from "next/server";

/**
 * Where this app is mounted, per `basePath` in next.config.ts.
 *
 * Read from there rather than from the request because a live probe of the
 * running server showed the mount point is absent from every request-side
 * value: `nextUrl.pathname` has had it stripped, `nextUrl.basePath` is empty,
 * and `request.url` carries it neither in the path nor in a forwarded-prefix
 * header. The only authority the app has on its own mount point is its config,
 * and duplicating the literal here would let the two drift apart, so this is
 * asserted against next.config.ts in tests/auth-expire-redirect.test.ts.
 *
 * A relative `Location` is required regardless: behind the platform's rewrite
 * proxy the request is re-issued to the upstream, so `request.url` describes
 * `localhost:3101` and carries the public scheme via `x-forwarded-proto`.
 * Building an absolute URL from it produced
 * `307 Location: https://localhost:3101/login` - a loopback host no browser can
 * open, so signing out dead-ended.
 */
const APP_BASE_PATH = "/demo/grocery";

/**
 * Cookie-expiry hop: used when a session LOOKS valid to the stateless edge
 * proxy (JWT signature OK) but fails DB validation (revoked/rotated/wiped).
 * Redirecting straight to /login would ping-pong with the proxy's
 * authed-users-leave-login rule; clearing the cookie first breaks any loop.
 *
 * The Location is the app's mount point plus the validated `next` path. It is
 * path-only, so the browser resolves it against whatever host the visitor
 * arrived on, and the result is identical on every hostname. `Set-Cookie` does
 * not care how the redirect is addressed.
 */
export async function GET(request: NextRequest) {
  const next = request.nextUrl.searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  const res = NextResponse.json(null, {
    status: 307,
    headers: { Location: `${APP_BASE_PATH}${safeNext}` },
  });
  res.cookies.delete("gs_session");
  return res;
}

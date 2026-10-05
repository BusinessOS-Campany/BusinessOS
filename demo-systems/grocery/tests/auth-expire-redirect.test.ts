import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import nextConfig from "../next.config";
import { GET } from "../src/app/api/auth/expire/route";

/**
 * Regression tests for the sign-out defect found on 2026-10-01.
 *
 * Signing out of `/grocery/dashboard` answered
 * `307 Location: https://localhost:3101/login` - a public scheme on a loopback
 * host, unreachable from any browser - because the route built an absolute URL
 * from `request.url`, which the platform's rewrite proxy re-issues against the
 * upstream origin and then re-schemes via `x-forwarded-proto`.
 *
 * A second fault surfaced once that was fixed: the redirect is relative now, but
 * this app mounts at `/demo/grocery`, and a hand-written `Location` gets no
 * basePath. The browser resolved `/login` against the origin root and landed on
 * the platform's own login instead of the app's.
 *
 * The mount point cannot be recovered from the request. A live probe of the
 * running server showed `nextUrl.pathname` already stripped, `nextUrl.basePath`
 * empty, and no forwarded-prefix header, so the route reads it from
 * `next.config.ts` instead. `keeps the mount point in step with next.config`
 * below is what stops those two from drifting apart.
 *
 * The remaining assertions are on the SHAPE of the Location, not on one host: a
 * relative path carrying the mount point is correct behind the proxy, on the
 * app's own port, and on any future tenant domain.
 */

const MOUNT = "/demo/grocery";

function expireRequest(query = "next=%2Flogin", origin = "http://localhost:3101"): NextRequest {
  return new NextRequest(`${origin}/api/auth/expire?${query}`);
}

describe("GET /api/auth/expire", () => {
  it("keeps the mount point in step with next.config", () => {
    // The route hardcodes the base path because the request cannot supply it.
    // This is the guard that makes that duplication safe.
    expect(nextConfig.basePath).toBe(MOUNT);
  });

  it("redirects to a relative path, never to an absolute upstream origin", async () => {
    const res = await GET(expireRequest());

    expect(res.status).toBe(307);

    const location = res.headers.get("location") ?? "";
    expect(location).toBe("/demo/grocery/login");
    // The defect: a scheme or host here leaks the loopback upstream to the user.
    expect(location).not.toMatch(/^https?:\/\//);
    expect(location).not.toContain("localhost");
  });

  it("stays relative whatever origin the request arrived on", async () => {
    for (const origin of [
      "http://localhost:3101",
      "https://bosc.dpdns.org",
      "https://acme.bosc.dpdns.org",
    ]) {
      const res = await GET(expireRequest("next=%2Flogin", origin));
      expect(res.headers.get("location")).toBe("/demo/grocery/login");
    }
  });

  it("clears the session cookie, which is the entire point of the hop", async () => {
    const res = await GET(expireRequest());
    const cookies = res.headers.getSetCookie?.() ?? [];
    expect(cookies.join(";")).toContain("gs_session=");
  });

  it("refuses an off-site `next` and falls back to the app root", async () => {
    for (const hostile of [
      "https://evil.example/steal",
      "//evil.example/steal",
      "javascript:alert(1)",
    ]) {
      const res = await GET(expireRequest(`next=${encodeURIComponent(hostile)}`));
      const location = res.headers.get("location") ?? "";
      expect(location).toBe("/demo/grocery/");
      expect(location).not.toContain("evil.example");
    }
  });

  it("honours a same-origin `next` path", async () => {
    const res = await GET(expireRequest("next=%2Finventory%2Fproducts"));
    expect(res.headers.get("location")).toBe("/demo/grocery/inventory/products");
  });

  it("defaults to the app root when no `next` is given", async () => {
    const res = await GET(expireRequest(""));
    expect(res.headers.get("location")).toBe("/demo/grocery/");
  });
});

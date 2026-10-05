import { describe, expect, it } from "vitest";
import { isSystemLoginRedirect, parseSetCookie } from "@/core/systems/runtime/cookies";

/**
 * A system the platform proxies keeps its own session, so the platform has to
 * hand that cookie to the browser on the system's behalf.
 *
 * Rebuilding the cookie from its name and value alone is what broke SSO: the
 * clone answers a rejected session with `gs_session=; Expires=Thu, 01 Jan 1970…`,
 * and a relay that drops `Expires` re-emits that as a permanent *empty* cookie.
 * The platform then sees `gs_session=` in every later request, concludes the
 * browser is already signed in, never calls the link route again, and the member
 * is bounced to `/{org}/grocery/login?next=/dashboard` for the rest of the
 * browser session. These tests pin the attributes that make a deletion a
 * deletion.
 */
describe("relaying a system's own session cookie", () => {
  it("keeps the lifetime the system asked for", () => {
    const parsed = parseSetCookie("gs_session=abc; Path=/gm/grocery; Max-Age=28800; HttpOnly; SameSite=lax");

    expect(parsed).not.toBeNull();
    expect(parsed?.name).toBe("gs_session");
    expect(parsed?.value).toBe("abc");
    expect(parsed?.path).toBe("/gm/grocery");
    expect(parsed?.maxAge).toBe(28800);
    expect(parsed?.remove).toBe(false);
  });

  it("keeps Secure, so a cookie scoped to https is not downgraded to http", () => {
    const parsed = parseSetCookie("gs_session=abc; Path=/; Secure; HttpOnly");

    expect(parsed?.secure).toBe(true);
  });

  it("keeps SameSite=Strict rather than assuming Lax", () => {
    expect(parseSetCookie("a=1; Path=/; SameSite=Strict")?.sameSite).toBe("strict");
    expect(parseSetCookie("a=1; Path=/; SameSite=None; Secure")?.sameSite).toBe("none");
  });

  it("reads an Expires in the future as a lifetime, not a deletion", () => {
    const parsed = parseSetCookie("sid=1; Path=/; Expires=Wed, 21 Oct 2099 07:28:00 GMT");

    expect(parsed?.remove).toBe(false);
    expect(parsed?.expires).toBeInstanceOf(Date);
  });

  it("treats the clone's expiry tombstone as a deletion", () => {
    // Exactly what the grocery system sends when it refuses a session.
    const parsed = parseSetCookie("gs_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly");

    expect(parsed?.remove).toBe(true);
    expect(parsed?.value).toBe("");
  });

  it("treats Max-Age=0 as a deletion", () => {
    expect(parseSetCookie("gs_session=; Path=/; Max-Age=0")?.remove).toBe(true);
    expect(parseSetCookie("gs_session=x; Path=/; Max-Age=-1")?.remove).toBe(true);
  });

  it("lets Max-Age win over Expires, as the RFC requires", () => {
    // Max-Age=0 with a future Expires is still a deletion.
    const parsed = parseSetCookie("gs_session=x; Path=/; Max-Age=0; Expires=Wed, 21 Oct 2099 07:28:00 GMT");

    expect(parsed?.remove).toBe(true);
  });

  it("keeps the deletion scoped to the path it was issued for", () => {
    // A deletion only removes the cookie the browser actually holds, so its Path
    // has to survive the relay.
    expect(parseSetCookie("gs_session=; Path=/gm/grocery; Max-Age=0")?.path).toBe("/gm/grocery");
  });

  it("defaults the way a browser would, rather than inventing attributes", () => {
    const parsed = parseSetCookie("a=1");

    expect(parsed).toMatchObject({ name: "a", value: "1", path: "/", httpOnly: false, secure: false });
  });

  it("ignores a header it cannot read instead of relaying half a cookie", () => {
    expect(parseSetCookie("")).toBeNull();
    expect(parseSetCookie("   ")).toBeNull();
    expect(parseSetCookie("no-equals-sign")).toBeNull();
    expect(parseSetCookie("=novalue")).toBeNull();
  });

  it("keeps an empty value that is not a deletion", () => {
    // Some apps set an empty value as a real state, so emptiness alone is not a
    // deletion — only an expiry in the past or a non-positive Max-Age is.
    const parsed = parseSetCookie("a=; Path=/");

    expect(parsed?.remove).toBe(false);
    expect(parsed?.value).toBe("");
  });
});

/**
 * A member of the platform who opens an org's system must never be shown that
 * system's own login form. The clone redirects there when its own session is
 * missing or stale, and the platform is the only party that can fix that: it has
 * already proven membership and it holds the link route.
 */
describe("recognising the system bouncing to its own login page", () => {
  const basePath = "/gm/grocery";

  it("sees the redirect the grocery system actually sends", () => {
    expect(
      isSystemLoginRedirect({ status: 307, location: "/gm/grocery/login?next=%2Fdashboard" }, basePath),
    ).toBe(true);
  });

  it("sees the same redirect without a next parameter", () => {
    expect(isSystemLoginRedirect({ status: 302, location: "/gm/grocery/login" }, basePath)).toBe(true);
  });

  it("sees an absolute Location, because the clone may build one", () => {
    expect(
      isSystemLoginRedirect({ status: 303, location: "https://bosc.dpdns.org/gm/grocery/login" }, basePath),
    ).toBe(true);
  });

  it("sees the expire route the clone uses to drop a dead session", () => {
    expect(isSystemLoginRedirect({ status: 307, location: "/gm/grocery/api/auth/expire?next=%2Flogin" }, basePath)).toBe(
      true,
    );
  });

  it("does not mistake another org's login page for this one's", () => {
    expect(isSystemLoginRedirect({ status: 307, location: "/ajwad/grocery/login" }, basePath)).toBe(false);
  });

  it("does not mistake one of the system's own pages for its login page", () => {
    expect(isSystemLoginRedirect({ status: 307, location: "/gm/grocery/forgot-password" }, basePath)).toBe(false);
    expect(isSystemLoginRedirect({ status: 307, location: "/gm/grocery/dashboard" }, basePath)).toBe(false);
  });

  it("does not treat a served login page as a bounce", () => {
    // The link route answering 200 is the success case; re-linking on it would
    // loop.
    expect(isSystemLoginRedirect({ status: 200, location: "/gm/grocery/login" }, basePath)).toBe(false);
    expect(isSystemLoginRedirect({ status: 500, location: "/gm/grocery/login" }, basePath)).toBe(false);
  });

  it("ignores a response with no Location at all", () => {
    expect(isSystemLoginRedirect({ status: 307, location: null }, basePath)).toBe(false);
  });
});
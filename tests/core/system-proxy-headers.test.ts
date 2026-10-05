import "@/core/config/load-env";
import { describe, expect, it } from "vitest";
import {
  buildUpstreamHeaders,
  carriesSessionCookie,
  sessionCookieFromSetCookie,
  splitSetCookieHeader,
  splitUpstreamHeaders,
} from "@/core/systems/runtime/proxy";

/**
 * What the platform sends to a system running in its own Node process. The
 * system is a second Next server, so two headers cannot simply be copied: Next
 * has already rewritten them by the time the route handler runs.
 */
describe("upstream request headers", () => {
  const browser = (overrides: Record<string, string> = {}) =>
    new Request("http://localhost:3100/gm/grocery/inventory/products", {
      headers: {
        host: "bosc.dpdns.org",
        origin: "https://bosc.dpdns.org",
        "next-url": "/inventory/products",
        ...overrides,
      },
    });

  const internal = { host: "localhost:3100", proto: "http" };

  it("names the browser's host, so the system's Server Action origin check passes", () => {
    const headers = buildUpstreamHeaders(browser(), internal);

    // The action handler prefers `x-forwarded-host` over `Host` and aborts when
    // it disagrees with `Origin`, which is the platform's own address here.
    expect(headers.get("x-forwarded-host")).toBe("bosc.dpdns.org");
  });

  it("keeps the host an outer reverse proxy already resolved", () => {
    const headers = buildUpstreamHeaders(
      browser({ "x-forwarded-host": "bosc.dpdns.org", "x-forwarded-proto": "https" }),
      internal,
    );

    expect(headers.get("x-forwarded-host")).toBe("bosc.dpdns.org");
    expect(headers.get("x-forwarded-proto")).toBe("https");
  });

  it("restores Next-Url from the copy the platform parked before Next deleted it", () => {
    // Next's `setVaryHeader` removes `next-url` from the request headers it
    // hands to a route handler, so the original only survives under the
    // platform's own name.
    const request = browser();
    request.headers.delete("next-url");
    request.headers.set("x-bos-next-url", "/inventory/products");

    expect(buildUpstreamHeaders(request, internal).get("next-url")).toBe("/inventory/products");
  });

  it("forwards the router's own cache-busting headers untouched", () => {
    const headers = buildUpstreamHeaders(
      browser({
        rsc: "1",
        "next-router-state-tree": "%5B%22%22%5D",
        "x-bos-next-url": "/inventory/products",
      }),
      internal,
    );

    expect(headers.get("rsc")).toBe("1");
    expect(headers.get("next-router-state-tree")).toBe("%5B%22%22%5D");
  });

  it("leaves cookies and connection-scoped headers to the caller", () => {
    const headers = buildUpstreamHeaders(browser({ cookie: "gs_session=abc", connection: "keep-alive" }), internal);

    expect(headers.get("cookie")).toBeNull();
    expect(headers.get("connection")).toBeNull();
  });
});

/**
 * The proxy forwards an org system's responses to the browser. `fetch` has
 * already decompressed the body by the time these headers are handled, so the
 * headers must describe the bytes actually being sent — otherwise the browser
 * rejects the response with ERR_CONTENT_DECODING_FAILED.
 */
describe("upstream response headers", () => {
  it("drops content-encoding, because the body was already decompressed", () => {
    const upstream = new Headers({ "content-type": "text/html", "content-encoding": "gzip" });
    const { headers } = splitUpstreamHeaders(upstream);

    expect(headers.get("content-type")).toBe("text/html");
    expect(headers.get("content-encoding")).toBeNull();
  });

  it("drops content-length, because the body is re-framed on the way out", () => {
    const upstream = new Headers({ "content-length": "14571", "content-type": "text/html" });
    const { headers } = splitUpstreamHeaders(upstream);

    expect(headers.get("content-length")).toBeNull();
    expect(headers.get("content-type")).toBe("text/html");
  });

  it("keeps headers the browser still needs", () => {
    const upstream = new Headers({
      "cache-control": "no-store",
      etag: '"abc"',
      "x-nextjs-cache": "HIT",
      "content-type": "application/json",
    });
    const { headers } = splitUpstreamHeaders(upstream);

    expect(headers.get("cache-control")).toBe("no-store");
    expect(headers.get("etag")).toBe('"abc"');
    expect(headers.get("x-nextjs-cache")).toBe("HIT");
  });

  it("never leaks a connection-scoped header", () => {
    const upstream = new Headers();
    for (const name of ["connection", "keep-alive", "transfer-encoding", "trailer", "upgrade"]) {
      upstream.set(name, "whatever");
    }
    upstream.set("content-type", "text/html");

    const { headers } = splitUpstreamHeaders(upstream);
    for (const name of ["connection", "keep-alive", "transfer-encoding", "trailer", "upgrade"]) {
      expect(headers.get(name)).toBeNull();
    }
  });

  it("routes cookies to the relay list instead of the browser headers", () => {
    const upstream = new Headers({ "set-cookie": "gs_session=abc; Path=/; HttpOnly" });
    const { headers, setCookies } = splitUpstreamHeaders(upstream);

    expect(headers.get("set-cookie")).toBeNull();
    expect(setCookies).toEqual(["gs_session=abc; Path=/; HttpOnly"]);
  });
});

describe("set-cookie splitting", () => {
  it("keeps a single cookie intact, Expires comma and all", () => {
    const one = "sid=1; Path=/; Expires=Wed, 21 Oct 2026 07:28:00 GMT; HttpOnly";
    expect(splitSetCookieHeader(one)).toEqual([one]);
  });

  it("splits cookies that were joined by the Headers API", () => {
    const joined = "a=1; Path=/, b=2; Path=/app, c=3; Path=/x";
    expect(splitSetCookieHeader(joined)).toEqual(["a=1; Path=/", "b=2; Path=/app", "c=3; Path=/x"]);
  });

  it("does not split on the comma inside Expires", () => {
    const joined =
      "a=1; Expires=Wed, 21 Oct 2026 07:28:00 GMT, b=2; Path=/";
    expect(splitSetCookieHeader(joined)).toEqual([
      "a=1; Expires=Wed, 21 Oct 2026 07:28:00 GMT",
      "b=2; Path=/",
    ]);
  });

  it("handles empty and whitespace input", () => {
    expect(splitSetCookieHeader("")).toEqual([]);
    expect(splitSetCookieHeader("   ")).toEqual([]);
  });
});

/**
 * Deciding whether the caller already holds a session for the system being
 * proxied, and naming the cookie the system just issued.
 *
 * Both were grocery-specific: the guard tested the literal `gs_session` and the
 * merge rebuilt that same name. A second system carrying `dc_session` therefore
 * re-linked on every single request and had its session merged upstream under a
 * name it does not read, so it could never hold a session at all.
 */
describe("proxied session cookies", () => {
  const jar = (cookie: string) => cookie;

  it("recognises the system's own cookie, whatever it is called", () => {
    expect(carriesSessionCookie(jar("dc_session=abc; Path=/"), "dc_session")).toBe(true);
    expect(carriesSessionCookie(jar("gs_session=abc; Path=/"), "gs_session")).toBe(true);
  });

  it("does not mistake one system's cookie for another's", () => {
    // The failure this whole change exists for: grocery's cookie present while a
    // dental clone is being served must not count as a dental session.
    expect(carriesSessionCookie(jar("gs_session=abc; Path=/"), "dc_session")).toBe(false);
    expect(carriesSessionCookie(jar("dc_session=abc; Path=/"), "gs_session")).toBe(false);
  });

  it("matches on a cookie boundary, not a substring", () => {
    expect(carriesSessionCookie(jar("x_dc_session=abc"), "dc_session")).toBe(false);
    expect(carriesSessionCookie(jar("dc_session_extra=abc"), "dc_session")).toBe(false);
    expect(carriesSessionCookie(jar("a=1; dc_session=abc; b=2"), "dc_session")).toBe(true);
  });

  it("treats an empty jar as holding nothing", () => {
    expect(carriesSessionCookie("", "dc_session")).toBe(false);
    expect(carriesSessionCookie("  ", "dc_session")).toBe(false);
  });

  it("assumes no session when the system's cookie name is unknown", () => {
    // Reported as needing a link rather than silently skipped, which is the safe
    // direction: the link route is idempotent and skipping it would strand a user.
    expect(carriesSessionCookie(jar("dc_session=abc"), null)).toBe(false);
  });

  it("names the cookie the system actually returned, instead of assuming grocery's", () => {
    const fromDental =
      "dc_session=eyJhbGciOi.payload.sig; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800";
    expect(sessionCookieFromSetCookie(fromDental, "dc_session")).toBe(
      "dc_session=eyJhbGciOi.payload.sig",
    );

    const fromGrocery = "gs_session=tok; Path=/; HttpOnly; SameSite=Lax";
    expect(sessionCookieFromSetCookie(fromGrocery, "gs_session")).toBe("gs_session=tok");
  });

  it("picks the named cookie even when the system sets several", () => {
    // Taking the first cookie would be a silent change to grocery the day its link
    // route grows a second Set-Cookie.
    const two = "gs_refresh=zzz; Path=/; HttpOnly, gs_session=tok; Path=/; HttpOnly";
    expect(sessionCookieFromSetCookie(two, "gs_session")).toBe("gs_session=tok");
    expect(sessionCookieFromSetCookie(two, "gs_refresh")).toBe("gs_refresh=zzz");
  });

  it("returns nothing when the system's own cookie is absent", () => {
    expect(sessionCookieFromSetCookie("gs_session=tok; Path=/", "dc_session")).toBeNull();
  });

  it("returns nothing for a deletion, so a dead session is not replayed upstream", () => {
    const deletion = "gs_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT";
    expect(sessionCookieFromSetCookie(deletion, "gs_session")).toBeNull();
  });

  it("returns nothing for a header that is not a cookie", () => {
    expect(sessionCookieFromSetCookie("", "dc_session")).toBeNull();
    expect(sessionCookieFromSetCookie("no-equals-sign", "dc_session")).toBeNull();
  });

  it("returns nothing when the system's cookie name is unknown", () => {
    expect(sessionCookieFromSetCookie("gs_session=tok", null)).toBeNull();
  });

  it("is indistinguishable from the old hardcoded path for grocery", () => {
    // The regression guarantee, stated as a test. Grocery was the only system that
    // ever worked, so replacing a literal `gs_session` with a looked-up name must
    // not change a single grocery outcome. This is the old expression, verbatim.
    const oldExtract = (setCookie: string | null): string | null => {
      const match = setCookie ? /(?:^|;\s*)gs_session=([^;]*)/.exec(setCookie) : null;
      return match?.[1] ? `gs_session=${match[1]}` : null;
    };
    const headers = [
      "gs_session=abc; Path=/; HttpOnly; SameSite=Lax",
      "gs_session=a.b.c; Path=/; HttpOnly; Max-Age=604800",
      "gs_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT",
      "other=1; Path=/",
      "",
      null,
    ];
    for (const header of headers) {
      expect(sessionCookieFromSetCookie(header, "gs_session")).toBe(oldExtract(header));
    }
  });

  it("recovers a grocery session the old regex dropped when another cookie came first", () => {
    // The old expression only matched `gs_session` at the start of the header or
    // after a `;`. The Headers API joins multiple Set-Cookie with ", ", so as soon
    // as a link route set a second cookie the session was silently lost — the same
    // class of bug as the hardcoded name, and found by the test above.
    const oldExtract = (setCookie: string | null): string | null => {
      const match = setCookie ? /(?:^|;\s*)gs_session=([^;]*)/.exec(setCookie) : null;
      return match?.[1] ? `gs_session=${match[1]}` : null;
    };
    const joined = "gs_refresh=zzz; Path=/, gs_session=tok; Path=/; HttpOnly";
    expect(oldExtract(joined)).toBeNull();
    expect(sessionCookieFromSetCookie(joined, "gs_session")).toBe("gs_session=tok");
  });

  it("differs from the old hardcoded path only where the old path was the bug", () => {
    // The same header, through the old expression and the new one.
    const dental = "dc_session=eyJhbGciOi.payload.sig; Path=/; HttpOnly; SameSite=Lax";
    const oldExtract = /(?:^|;\s*)gs_session=([^;]*)/.exec(dental);
    expect(oldExtract ? `gs_session=${oldExtract[1]}` : null).toBeNull();
    expect(sessionCookieFromSetCookie(dental, "dc_session")).toBe(
      "dc_session=eyJhbGciOi.payload.sig",
    );
  });
});

import "@/core/config/load-env";
import { describe, expect, it } from "vitest";
import {
  buildUpstreamHeaders,
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

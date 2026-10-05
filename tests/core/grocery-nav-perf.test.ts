import { describe, expect, it } from "vitest";
import { appHref, serviceWorkerUrl } from "../../system/grocery/src/lib/app-url";
import { isFresh } from "../../system/grocery/src/lib/ttl";

/**
 * Unit coverage for the grocery navigation hot path.
 *
 * Both helpers are pure and import-free on purpose so the root suite can pin the
 * two contracts that decide how expensive a sidebar click is, without booting a
 * Next server or a database:
 *
 * - which service worker the tenant app registers (scope bug that caused the
 *   origin-wide platform worker to take over and force full reloads), and
 * - how long a derived notification scan is allowed to suppress re-scanning.
 */

describe("serviceWorkerUrl", () => {
  it("keeps the standalone mount point unchanged", () => {
    expect(serviceWorkerUrl("/grocery")).toBe("/grocery/sw.js");
  });

  it("scopes the worker to the org mount point instead of the origin root", () => {
    // The bug: registering "/sw.js" made the platform's origin-scope worker
    // control every tenant app.
    expect(serviceWorkerUrl("/gm/grocery")).toBe("/gm/grocery/sw.js");
    expect(serviceWorkerUrl("/gm/grocery")).not.toBe("/sw.js");
  });

  it("tolerates missing, empty, and trailing-slash base paths", () => {
    expect(serviceWorkerUrl(undefined)).toBe("/sw.js");
    expect(serviceWorkerUrl(null)).toBe("/sw.js");
    expect(serviceWorkerUrl("")).toBe("/sw.js");
    expect(serviceWorkerUrl("/gm/grocery/")).toBe("/gm/grocery/sw.js");
    expect(serviceWorkerUrl("//gm//grocery//")).toBe("/gm/grocery/sw.js");
  });

  it("always returns a root-relative path with no duplicate slashes", () => {
    const url = serviceWorkerUrl("/gm/grocery");
    expect(url.startsWith("/")).toBe(true);
    expect(url.slice(1)).not.toContain("//");
    expect(url).toBe(new URL(url, "https://x.test").pathname);
  });
});

describe("appHref", () => {
  it("prefixes a root-absolute path with the org mount point", () => {
    // The bug: a plain <a href="/sales/receipt/x"> is not rewritten by Next,
    // so it left the org mount point and 404'd on the platform root.
    expect(appHref("/sales/receipt/abc", "/gm/grocery")).toBe("/gm/grocery/sales/receipt/abc");
    expect(appHref("/inventory/stock", "/gm/grocery")).toBe("/gm/grocery/inventory/stock");
    expect(appHref("/api/backups/7/download", "/p967770416171/grocery")).toBe(
      "/p967770416171/grocery/api/backups/7/download",
    );
  });

  it("passes the path through when there is no base path", () => {
    expect(appHref("/sales/receipt/abc", undefined)).toBe("/sales/receipt/abc");
    expect(appHref("/sales/receipt/abc", "")).toBe("/sales/receipt/abc");
  });

  it("is idempotent, so an already-prefixed path is not doubled", () => {
    expect(appHref("/gm/grocery/sales/receipt/abc", "/gm/grocery")).toBe("/gm/grocery/sales/receipt/abc");
  });

  it("tolerates trailing slashes and missing leading slashes", () => {
    expect(appHref("/sales/receipt/abc", "/gm/grocery/")).toBe("/gm/grocery/sales/receipt/abc");
    expect(appHref("sales/receipt/abc", "/gm/grocery")).toBe("/gm/grocery/sales/receipt/abc");
  });

  it("keeps query strings and never collapses them into the path", () => {
    expect(appHref("/inventory/products?q=cola", "/gm/grocery")).toBe("/gm/grocery/inventory/products?q=cola");
  });

  it("leaves absolute and protocol-relative URLs alone", () => {
    expect(appHref("https://example.test/x", "/gm/grocery")).toBe("https://example.test/x");
    expect(appHref("//example.test/x", "/gm/grocery")).toBe("//example.test/x");
  });
});

describe("isFresh", () => {
  it("suppresses re-work inside the ttl window", () => {
    expect(isFresh(1_000, 1_000, 20_000)).toBe(true);
    expect(isFresh(1_000, 20_999, 20_000)).toBe(true);
  });

  it("expires at and after the window boundary", () => {
    expect(isFresh(1_000, 21_000, 20_000)).toBe(false);
    expect(isFresh(1_000, 90_000, 20_000)).toBe(false);
  });

  it("treats a missing timestamp as stale", () => {
    expect(isFresh(null, 5_000, 20_000)).toBe(false);
  });
});
import { describe, expect, it } from "vitest";
import { orgSystemPath, systemUpstreamUrl } from "@/core/systems/runtime/urls";

/**
 * An org's system is served under the org: `/{org}/{system}`. That path is three
 * things at once — the URL the customer sees, the child's own `basePath` (so its
 * links and asset URLs come out right with no rewriting), and the key the runtime
 * is registered under. Getting it wrong means the child's HTML points at assets
 * the platform will not proxy, so it is built in one place and tested.
 */
describe("org system path", () => {
  it("is the org then the system", () => {
    expect(orgSystemPath("ajwad", "grocery")).toBe("/ajwad/grocery");
  });

  it("survives a folder-style org slug", () => {
    expect(orgSystemPath("p967775008926", "grocery")).toBe("/p967775008926/grocery");
  });

  it("refuses a segment that would climb out of the path", () => {
    // A slug is interpolated into a URL and into the child's basePath. Anything
    // that is not a plain segment is refused rather than escaped, so a value
    // that got here from anywhere unexpected fails loudly.
    for (const bad of ["../evil", "aj wad", "ajwad/extra", "", "ajwad?", "ajwad#"]) {
      expect(() => orgSystemPath(bad, "grocery")).toThrow();
    }
    for (const bad of ["grocery/../..", "gro cery", ""]) {
      expect(() => orgSystemPath("ajwad", bad)).toThrow();
    }
  });
});

describe("system upstream url", () => {
  const runtime = { origin: "http://127.0.0.1:4103", basePath: "/ajwad/grocery" };

  it("targets the child's own basePath at the system root", () => {
    expect(systemUpstreamUrl(runtime, [], "")).toBe("http://127.0.0.1:4103/ajwad/grocery");
  });

  it("passes the rest of the path straight through", () => {
    expect(systemUpstreamUrl(runtime, ["sales", "pos"], "")).toBe(
      "http://127.0.0.1:4103/ajwad/grocery/sales/pos",
    );
  });

  it("carries the query string over untouched", () => {
    expect(systemUpstreamUrl(runtime, ["products"], "?page=2&q=%D8%B9%D9%84%D9%8A")).toBe(
      "http://127.0.0.1:4103/ajwad/grocery/products?page=2&q=%D8%B9%D9%84%D9%8A",
    );
  });

  it("does not double the slash when the system root is requested", () => {
    expect(systemUpstreamUrl(runtime, [], "?next=%2Fajwad")).toBe(
      "http://127.0.0.1:4103/ajwad/grocery?next=%2Fajwad",
    );
  });
});

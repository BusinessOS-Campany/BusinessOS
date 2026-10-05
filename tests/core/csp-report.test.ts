import { describe, expect, it } from "vitest";
import { parseCspReport } from "@/app/api/csp-report/report";

/**
 * `src/proxy.ts` advertises `report-uri /api/csp-report` in development, so the
 * browser POSTs violations there. The parser is the only part of the sink worth
 * asserting: it must survive arbitrary attacker-influenced payloads, and it must
 * not echo a secret-bearing URL back into the logs.
 */
describe("parseCspReport", () => {
  it("unwraps the csp-report envelope", () => {
    const summary = parseCspReport({
      "csp-report": {
        "document-uri": "https://bosc.dpdns.org/app/grocery",
        "blocked-uri": "https://static.cloudflareinsights.com/beacon.min.js",
        "violated-directive": "script-src-elem",
        "effective-directive": "script-src",
        "source-file": "https://bosc.dpdns.org/app/grocery",
        "line-number": 12,
      },
    });

    expect(summary).toEqual({
      documentUri: "https://bosc.dpdns.org/app/grocery",
      blockedUri: "https://static.cloudflareinsights.com/beacon.min.js",
      violatedDirective: "script-src-elem",
      effectiveDirective: "script-src",
      sourceFile: "https://bosc.dpdns.org/app/grocery",
      lineNumber: 12,
    });
  });

  it("accepts an unwrapped body so a future report-to directive still lands", () => {
    const summary = parseCspReport({ "violated-directive": "img-src" });

    expect(summary?.violatedDirective).toBe("img-src");
  });

  it("drops the query string and fragment from URLs", () => {
    const summary = parseCspReport({
      "csp-report": {
        "document-uri": "https://bosc.dpdns.org/app?token=secret#frag",
        "blocked-uri": "https://evil.test/x.js?key=abc",
      },
    });

    expect(summary?.documentUri).toBe("https://bosc.dpdns.org/app");
    expect(summary?.blockedUri).toBe("https://evil.test/x.js");
  });

  it("returns null for payloads that carry no report", () => {
    expect(parseCspReport(null)).toBeNull();
    expect(parseCspReport("nope")).toBeNull();
    expect(parseCspReport(42)).toBeNull();
    expect(parseCspReport({ "csp-report": "not-an-object" })).toBeNull();
    expect(parseCspReport({ "csp-report": null })).toBeNull();
  });

  it("nulls out absent and wrongly-typed fields instead of throwing", () => {
    const summary = parseCspReport({
      "csp-report": { "document-uri": 5, "line-number": "12", "blocked-uri": "" },
    });

    expect(summary).toEqual({
      documentUri: null,
      blockedUri: null,
      violatedDirective: null,
      effectiveDirective: null,
      sourceFile: null,
      lineNumber: null,
    });
  });

  it("caps oversized fields so one report cannot flood the log line", () => {
    const summary = parseCspReport({ "csp-report": { "source-file": "a".repeat(5000) } });

    expect(summary?.sourceFile).toHaveLength(500);
  });
});

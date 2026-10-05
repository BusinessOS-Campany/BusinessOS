/**
 * Parsing for the `report-uri /api/csp-report` directive that `src/proxy.ts`
 * emits in development.
 *
 * Lives outside `route.ts` because Next.js type-checks route modules against a
 * fixed export set — only the HTTP verbs and a few config keys are allowed, so
 * the parser cannot be a named export there. Kept free of server-only imports
 * so it stays unit-testable.
 */

const MAX_FIELD = 500;

export interface CspReportSummary {
  documentUri: string | null;
  blockedUri: string | null;
  violatedDirective: string | null;
  effectiveDirective: string | null;
  sourceFile: string | null;
  lineNumber: number | null;
}

function str(value: unknown, max = MAX_FIELD): string | null {
  return typeof value === "string" && value.length > 0 ? value.slice(0, max) : null;
}

/** Drops the query string and fragment — a report echoes back the full page URL. */
function withoutQuery(url: string | null): string | null {
  if (url === null) return null;
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

/**
 * Normalizes a `report-uri` payload (`{"csp-report": {...}}`) into a bounded,
 * loggable summary. Returns `null` when the body carries no usable report
 * rather than throwing, so a junk POST cannot turn into a server error.
 */
export function parseCspReport(payload: unknown): CspReportSummary | null {
  if (typeof payload !== "object" || payload === null) return null;
  const outer = payload as Record<string, unknown>;
  // An absent envelope key means the body is already the report; a present but
  // non-object one means there is no report at all.
  const envelope = "csp-report" in outer ? outer["csp-report"] : outer;
  if (typeof envelope !== "object" || envelope === null) return null;

  const report = envelope as Record<string, unknown>;
  return {
    documentUri: withoutQuery(str(report["document-uri"])),
    blockedUri: withoutQuery(str(report["blocked-uri"])),
    violatedDirective: str(report["violated-directive"], 200),
    effectiveDirective: str(report["effective-directive"], 200),
    sourceFile: str(report["source-file"]),
    lineNumber: typeof report["line-number"] === "number" ? report["line-number"] : null,
  };
}

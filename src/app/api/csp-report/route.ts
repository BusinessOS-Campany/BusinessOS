import { NextResponse } from "next/server";
import { logger } from "@/core/logging/logger";
import { parseCspReport } from "./report";

/**
 * Sink for the `report-uri /api/csp-report` directive that `src/proxy.ts` emits
 * in development. The browser fires these itself — unauthenticated, advisory,
 * and attacker-influenceable — so the handler never resolves a tenant, never
 * touches the database, and always answers `204` rather than surfacing a body
 * the browser would only discard.
 */

const MAX_BODY_BYTES = 8_192;

export async function POST(request: Request): Promise<Response> {
  let summary = null;
  try {
    const raw = await request.text();
    if (raw.length <= MAX_BODY_BYTES) {
      summary = parseCspReport(JSON.parse(raw));
    }
  } catch {
    // Deliberately swallowed: a malformed report is not the caller's problem.
  }

  if (summary !== null) {
    logger.warn({ csp: summary }, "csp violation reported");
  }
  return new NextResponse(null, { status: 204 });
}

import { NextResponse } from "next/server";

/**
 * Readiness for the platform's runtime supervisor.
 *
 * The supervisor polls this after starting the process and before routing a
 * customer's traffic to it, so it must answer without touching the database:
 * "the server booted and can serve" is a different question from "the data is
 * reachable", and the second one is what the pages themselves are for.
 */
export const dynamic = "force-dynamic";

export function GET(): NextResponse {
  return NextResponse.json(
    { ok: true, system: "dental", org: process.env.BOS_ORG_SLUG ?? null },
    { headers: { "cache-control": "no-store" } },
  );
}
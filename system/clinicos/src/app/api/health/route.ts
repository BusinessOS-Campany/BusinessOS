import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET(): NextResponse {
  return NextResponse.json(
    { ok: true, system: "clinicos", org: process.env.BOS_ORG_SLUG ?? null },
    { headers: { "cache-control": "no-store" } },
  );
}
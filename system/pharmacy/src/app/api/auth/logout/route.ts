import { NextResponse } from "next/server";
import { clearSessionCookie, getSession } from "@/lib/auth";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";

export async function POST() {
  const session = await getSession();
  if (session?.userId) {
    await recordAudit(session.userId, AUDIT_ACTIONS.LOGOUT, "user", session.userId);
  }
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
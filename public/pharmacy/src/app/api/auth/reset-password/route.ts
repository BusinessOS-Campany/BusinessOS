import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";

export async function POST(req: Request) {
  const { token, password } = await req.json();
  if (!token || !password || password.length < 8) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const reset = await prisma.passwordResetToken.findUnique({ where: { token } });
  if (!reset || reset.used || reset.expiresAt < new Date()) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: reset.userId },
      data: { passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: reset.id },
      data: { used: true },
    }),
  ]);

  await recordAudit(reset.userId, AUDIT_ACTIONS.PASSWORD_RESET, "user", reset.userId);
  return NextResponse.json({ ok: true });
}
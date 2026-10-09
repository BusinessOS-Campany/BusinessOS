import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { setSessionCookie } from "@/lib/auth";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";

export async function POST(req: Request) {
  try {
    const { username, password } = await req.json();
    if (!username || !password) {
      return NextResponse.json({ error: "invalid" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || !user.isActive) {
      return NextResponse.json({ error: user ? "disabled" : "invalid" }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "invalid" }, { status: 401 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await setSessionCookie({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const userAgent = req.headers.get("user-agent");
    await recordAudit(user.id, AUDIT_ACTIONS.LOGIN, "user", user.id, { ip, userAgent });

    return NextResponse.json({ ok: true, name: user.name });
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 500 });
  }
}
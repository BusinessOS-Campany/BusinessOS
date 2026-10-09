import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const { email } = await req.json();
  if (!email) return NextResponse.json({ ok: true });

  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    const token = randomBytes(32).toString("hex");
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    const resetUrl = `${req.headers.get("origin") ?? "http://localhost:3108"}/reset-password/${token}`;
    if (process.env.NODE_ENV === "development") {
      console.log(`[pharmacy] reset link: ${resetUrl}`);
    }
  }

  return NextResponse.json({ ok: true });
}
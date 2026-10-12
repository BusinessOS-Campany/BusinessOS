import { createHmac, timingSafeEqual } from "node:crypto";
import { SignJWT } from "jose";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/core/auth/server";

export const SESSION_COOKIE = "co_session_token";

export async function GET(): Promise<NextResponse> {
  const verification = verifyGatewayToken(request as Request);
  if (!verification) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const { claims } = verification;
  const { organizationId, organizationSlug, userId, email, name, role } = claims;

  // Ensure the user exists and has the right role
  await ensureUser(userId, email, name, role);

  // Ensure the password account exists
  await ensureAccount(userId);

  // Create session cookie JWT
  const sessionCookie = createSessionCookie(userId, email, name, role);

  return NextResponse.json(
    { ok: true, org: organizationSlug, sessionCookie },
    {
      headers: {
        "set-cookie": `co_session_token=${sessionCookie}; httpOnly; path=/; sameSite=lax; ${process.env.NODE_ENV === "production" ? "secure" : ""}`,
        "cache-control": "no-store",
      },
    },
  );
}

export async function POST(): Promise<NextResponse> {
  return GET();
}

function verifyGatewayToken(request: Request): { claims: any } | null {
  const token = request.headers.get("x-bos-gateway-token");
  if (!token || !process.env.BOS_GATEWAY_SECRET) return null;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = Buffer.from(
    createHmac("sha256", process.env.BOS_GATEWAY_SECRET!).update(payload).digest("base64url"),
  );
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (process.env.BOS_ORG_ID && claims.organizationId !== process.env.BOS_ORG_ID) return null;
    return { claims };
  } catch {
    return null;
  }
}

async function ensureUser(userId: string, email: string, name: string, role: string) {
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (existing) {
    if (existing.roleId !== role) {
      await prisma.user.update({ where: { id: userId }, data: { roleId: role } });
    }
    return existing;
  }
  return await prisma.user.create({
    data: {
      id: userId,
      name,
      email,
      roleId: role,
      isActive: true,
    },
  });
}

async function ensureAccount(userId: string) {
  const existing = await prisma.account.findFirst({
    where: { providerId: "password", userId },
  });
  if (existing) return existing;
  return await prisma.account.create({
    data: {
      id: crypto.randomUUID(),
      providerId: "password",
      userId,
      password: `!platform-${userId}`,
    },
  });
}

function createSessionCookie(userId: string, email: string, name: string, role: string): string {
  return new SignJWT({
    sub: userId,
    email,
    name,
    role,
    iat: Math.floor(Date.now() / 1000),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(process.env.BETTER_AUTH_SECRET ?? "dev-secret"));
}
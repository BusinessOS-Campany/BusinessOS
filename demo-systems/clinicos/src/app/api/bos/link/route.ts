import { createHmac, timingSafeEqual } from "node:crypto";
import { SignJWT } from "jose";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/core/auth/server";

const GATEWAY_HMAC = process.env.BOS_GATEWAY_SECRET;

/**
 * Verify the platform's gateway token and extract claims.
 */
function verifyGatewayToken(request: Request): { claims: any } | null {
  const token = request.headers.get("x-bos-gateway-token");
  if (!token || !GATEWAY_HMAC) return null;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = Buffer.from(
    createHmac("sha256", GATEWAY_HMAC).update(payload).digest("base64url"),
  );
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given))
    return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    // The token names one organization; this process belongs to exactly one
    if (process.env.BOS_ORG_ID && claims.organizationId !== process.env.BOS_ORG_ID)
      return null;
    return { claims };
  } catch {
    return null;
  }
}

/** Create or find the user in the clinicOS schema. */
async function ensureUser(userId: string, email: string, name: string, role: string) {
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (existing) {
    // Update role if changed
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

/** Create or find the password Account for the user. */
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

/** Create a JWT session cookie that better-auth can verify. */
function createSessionCookie(userId: string, email: string, name: string, role: string): string {
  const jwt = await new SignJWT({
    sub: userId,
    email,
    name,
    role,
    iat: Math.floor(Date.now() / 1000),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(process.env.BETTER_AUTH_SECRET ?? "dev-secret"));
  return jwt;
}

export const dynamic = "force-dynamic";

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
  // POST is also valid for link (some clients use POST)
  return GET();
}
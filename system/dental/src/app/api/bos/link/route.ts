import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { setSessionCookie } from "@/lib/auth";

/**
 * Signs a platform user into this organization's own copy of the system, and
 * carries the password they can use here from now on.
 *
 * The platform runs one process per organization, and that process has its own
 * database with its own `User` table — it cannot read the platform's session and
 * it cannot read the platform's account store. So on the first request the
 * platform sends a short-lived signed statement of who is asking
 * (`x-bos-gateway-token`); this route verifies it, makes sure a local user exists
 * for that person, and issues one of this system's own session cookies. After
 * that the browser carries `dc_session` and this route is never called again.
 *
 * The token is only ever accepted over a loopback connection from the platform,
 * and it is signed with a secret this process was started with, so a request
 * that did not come through the platform's proxy cannot forge one.
 *
 * ## Why `passwordHash` arrives in the request body
 *
 * The platform stores its own password as a scrypt digest, which this system
 * cannot verify and which cannot be converted into bcrypt. So the only way one
 * password can work on both sides is for the platform to keep a bcrypt digest of
 * its own — it does that at signup and at every password change — and hand it
 * over here.
 *
 * It travels in the POST BODY, never inside the token. A token is
 * `base64url(json).base64url(hmac)`: signed, not encrypted, so anything put in
 * it is readable by anyone who can see it, and it is minted per request and can
 * appear in logs. The body goes to one loopback port and nowhere else.
 *
 * A digest is still a secret, so this route refuses anything that is not a
 * bcrypt digest, and a placeholder is never preserved.
 */

export const dynamic = "force-dynamic";

interface Claims {
  v: 1;
  organizationId: string;
  organizationSlug: string;
  userId: string;
  email: string;
  name: string;
  role: string;
  exp: number;
}

/**
 * Platform role -> this system's `Role.key`.
 *
 * Dental has no read-only role, so `member`, `cashier` and `viewer` all land on
 * RECEPTIONIST, which is the least-privileged key the app defines. An org that
 * wants a genuine viewer should add the key in `src/lib/permissions.ts` and
 * extend this map; inventing one here would create a role the UI does not know
 * how to label.
 */
const ROLE_MAP: Record<string, string> = {
  owner: "SUPER_ADMIN",
  admin: "CLINIC_OWNER",
  manager: "BRANCH_MANAGER",
  member: "RECEPTIONIST",
  cashier: "RECEPTIONIST",
  viewer: "RECEPTIONIST",
};

const DEFAULT_ROLE_KEY = "RECEPTIONIST";

/** bcrypt digests look like `$2a$12$<53 chars>`. Nothing else is accepted. */
const BCRYPT_DIGEST = /^\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{53}$/;

/** Cost floor. A cheaper digest is still bcrypt, but never one we should install. */
const MIN_BCRYPT_COST = 10;

function verify(token: string | null, secret: string): Claims | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = Buffer.from(createHmac("sha256", secret).update(payload).digest("base64url"));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Claims;
    if (claims.v !== 1) return null;
    if (typeof claims.exp !== "number" || claims.exp * 1000 < Date.now()) return null;
    // The token names one organization; this process belongs to exactly one, so
    // a token minted for a different org must never be honoured here.
    if (process.env.BOS_ORG_ID && claims.organizationId !== process.env.BOS_ORG_ID) return null;
    return claims;
  } catch {
    return null;
  }
}

/** A local username for a platform account: their email, or a slug of their id. */
function usernameFor(claims: Claims): string {
  if (claims.email) return claims.email.toLowerCase();
  return `platform-${claims.userId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24).toLowerCase()}`;
}

/** True when a stored value is a bcrypt digest this system can actually verify. */
function isUsableDigest(value: string): boolean {
  if (!BCRYPT_DIGEST.test(value)) return false;
  return Number(value.split("$")[2]) >= MIN_BCRYPT_COST;
}

interface LinkBody {
  /** bcrypt digest of the member's platform password, or absent/null. */
  passwordHash?: string | null;
}

/**
 * What to do with the stored hash given the digest the platform just sent.
 *
 * The platform is the single source of truth for a member's password, so its
 * digest always wins. `same` is the one case that does not write: an identical
 * digest means the row already matches, and the link route runs on every request
 * that arrives without a session cookie.
 *
 * A stored placeholder is a value this system invented (`!platform-…`) precisely
 * because it had no real password. It is never equal to a bcrypt digest, so it
 * takes the `replace` path and becomes usable.
 */
function hashPolicy(current: string | null, incoming: string): "same" | "replace" {
  return current === incoming ? "same" : "replace";
}

export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.BOS_GATEWAY_SECRET;
  if (!secret) {
    return NextResponse.json({ error: { code: "NOT_CONFIGURED" } }, { status: 501 });
  }

  const claims = verify(request.headers.get("x-bos-gateway-token"), secret);
  if (!claims) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as LinkBody;
  const incoming = typeof body.passwordHash === "string" ? body.passwordHash : null;
  // A digest that is not a bcrypt digest is rejected rather than stored, so a
  // malformed or hostile body cannot put something un-verifiable in the column
  // that gates every local login.
  if (incoming !== null && !isUsableDigest(incoming)) {
    return NextResponse.json({ error: { code: "INVALID_CREDENTIAL" } }, { status: 400 });
  }

  const roleKey = ROLE_MAP[claims.role] ?? DEFAULT_ROLE_KEY;
  const role = await prisma.role.findUnique({ where: { key: roleKey }, select: { id: true } });
  if (!role) {
    // Roles come from `prisma/bootstrap.ts`. Without one there is no permission
    // set to attach, so refuse rather than create a user that would silently
    // have no access.
    return NextResponse.json({ error: { code: "ROLE_MISSING", role: roleKey } }, { status: 503 });
  }

  const username = usernameFor(claims);
  const existing = await prisma.user.findUnique({
    where: { username },
    select: { id: true, roleId: true, isActive: true, passwordHash: true, branchId: true, name: true },
  });

  let userId: string;
  let branchId: string | null = null;
  let name = claims.name || username;
  const isDentist = false;
  let passwordMirrored = false;

  if (existing) {
    if (!existing.isActive) {
      return NextResponse.json({ error: { code: "USER_DISABLED" } }, { status: 403 });
    }
    userId = existing.id;
    branchId = existing.branchId;
    name = existing.name || name;
    // A role change on the platform must be reflected here, otherwise a demoted
    // owner would keep the access they had when they first signed in.
    const patch: { roleId?: string; passwordHash?: string } = {};
    if (existing.roleId !== role.id) patch.roleId = role.id;
    if (incoming && hashPolicy(existing.passwordHash, incoming) === "replace") {
      patch.passwordHash = incoming;
      passwordMirrored = true;
    }
    if (patch.roleId || patch.passwordHash) {
      await prisma.user.update({ where: { id: existing.id }, data: patch });
    }
  } else {
    const created = await prisma.user.create({
      data: {
        username,
        // `email` is unique and required, so a claim without one still needs a
        // value. The `platform-<id>` form keeps it distinct from any real
        // address rather than colliding on an empty string.
        email: claims.email || `${username}@platform.local`,
        // With a platform digest the member signs in here with the same email
        // and password they use on the platform. Without one this account stays
        // platform-only, and the hash is deliberately unusable so the local login
        // form can never be used to get in as a platform-provisioned user.
        passwordHash: incoming ?? `!platform-${createHmac("sha256", claims.userId).update(username).digest("hex")}`,
        name,
        roleId: role.id,
        isActive: true,
      },
      select: { id: true },
    });
    userId = created.id;
    passwordMirrored = incoming !== null;
  }

  await setSessionCookie({
    userId,
    email: claims.email || `${username}@platform.local`,
    name,
    role: roleKey,
    branchId,
    isDentist,
  });

  return NextResponse.json(
    { ok: true, org: claims.organizationSlug, passwordMirrored },
    { headers: { "cache-control": "no-store" } },
  );
}
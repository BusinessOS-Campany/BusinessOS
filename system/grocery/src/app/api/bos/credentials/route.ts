import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/shared/db";

/**
 * Writes a batch of platform passwords into this organization's own `users`
 * table.
 *
 * The sibling `api/bos/link` route handles ONE member, and only when a browser
 * arrives without a session cookie. That is the wrong shape for two other
 * moments:
 *
 *  - a cold boot, where every member's digest has to be in place before anyone
 *    can type a password;
 *  - a password change on the platform, where the member may be signed into
 *    several orgs' copies and each has to hear about it.
 *
 * So this route takes the whole (org, app) set at once. It is authenticated the
 * same way `link` is — the same short-lived HMAC token in `x-bos-gateway-token`,
 * verified with the secret this process was started with, over the platform's
 * loopback proxy — and it additionally refuses any token for another org.
 *
 * Digests arrive in the BODY, never inside the token: a token is base64url JSON
 * with an HMAC, which is signed but not encrypted, so anything inside it is
 * readable to anyone who can see it.
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

const BCRYPT_DIGEST = /^\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{53}$/;
const MIN_BCRYPT_COST = 10;
/** One org's members; a larger body than this is not a member list. */
const MAX_CREDENTIALS = 500;

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
    if (process.env.BOS_ORG_ID && claims.organizationId !== process.env.BOS_ORG_ID) return null;
    return claims;
  } catch {
    return null;
  }
}

/** True when a value is a bcrypt digest this system can actually verify. */
function isUsableDigest(value: string): boolean {
  if (!BCRYPT_DIGEST.test(value)) return false;
  return Number(value.split("$")[2]) >= MIN_BCRYPT_COST;
}

interface IncomingCredential {
  username?: unknown;
  passwordHash?: unknown;
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

  const body = (await request.json().catch(() => null)) as { credentials?: IncomingCredential[] } | null;
  const list = Array.isArray(body?.credentials) ? body.credentials : null;
  if (!list) {
    return NextResponse.json({ error: { code: "INVALID_BODY" } }, { status: 400 });
  }
  if (list.length > MAX_CREDENTIALS) {
    return NextResponse.json({ error: { code: "TOO_MANY" } }, { status: 413 });
  }

  // Every entry is validated before a single row is written, so a malformed item
  // cannot leave an org half-mirrored: either the whole batch is well-formed or
  // nothing is stored.
  const accepted: { username: string; passwordHash: string }[] = [];
  for (const item of list) {
    const username = typeof item?.username === "string" ? item.username.trim() : "";
    const passwordHash = typeof item?.passwordHash === "string" ? item.passwordHash : "";
    if (!username || !isUsableDigest(passwordHash)) {
      return NextResponse.json({ error: { code: "INVALID_CREDENTIAL", username } }, { status: 400 });
    }
    accepted.push({ username, passwordHash });
  }

  if (accepted.length === 0) {
    return NextResponse.json({ ok: true, updated: 0, unchanged: 0 });
  }

  // A member who does not exist here yet is left alone: `link` creates accounts
  // on first visit, and this route must not resurrect an account an org deleted.
  const existing = await db.user.findMany({
    where: { username: { in: accepted.map((c) => c.username) } },
    select: { id: true, username: true, passwordHash: true, deletedAt: true },
  });
  const byUsername = new Map(existing.map((row) => [row.username, row]));

  let updated = 0;
  let unchanged = 0;
  let missing = 0;
  for (const item of accepted) {
    const user = byUsername.get(item.username);
    if (!user || user.deletedAt !== null) {
      missing += 1;
      continue;
    }
    if (user.passwordHash === item.passwordHash) {
      unchanged += 1;
      continue;
    }
    await db.user.update({
      where: { id: user.id },
      // Only the hash. The role stays whatever `link` last set from the
      // platform's membership, so a batch push can never silently change what a
      // member is allowed to do.
      data: { passwordHash: item.passwordHash, mustChangePassword: false },
    });
    updated += 1;
  }

  return NextResponse.json(
    { ok: true, updated, unchanged, missing },
    { headers: { "cache-control": "no-store" } },
  );
}

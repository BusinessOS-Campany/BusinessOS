import { createHmac, timingSafeEqual } from "node:crypto";
import { getEnv } from "@/core/config/env";

/**
 * The token the platform hands a system runtime so the system knows WHO is
 * asking without ever seeing the platform's session cookie.
 *
 * The system runs as the org's own process with its own database and its own
 * user table, so it cannot read the platform session. Instead the platform
 * mints a short-lived, signed statement of identity — this is a request-level
 * bearer token, not a login: it carries no privileges of its own beyond naming
 * the user, and it expires in minutes.
 *
 * The system verifies the signature with the same secret and then provisions
 * that user locally, so an org member signs in once, on the platform, and is
 * recognised by their own system afterwards.
 *
 * Format: `base64url(json).base64url(hmac)`. Deliberately simple so the system
 * can verify it in a few lines without depending on this codebase.
 */

export interface OrgTokenClaims {
  /** Format version, so a future change can be rejected rather than misread. */
  v: 1;
  organizationId: string;
  organizationSlug: string;
  userId: string;
  email: string;
  name: string;
  /** Platform role: owner, admin, member… mapped to a local role by the system. */
  role: string;
  exp: number;
}

/** Five minutes: long enough for a page load and its asset requests. */
const TTL_SECONDS = 300;

function secret(): string {
  return getEnv().AUTH_SECRET;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

export function issueOrgToken(claims: Omit<OrgTokenClaims, "v" | "exp">): string {
  const payload = b64url(
    JSON.stringify({
      v: 1,
      ...claims,
      exp: Math.floor(Date.now() / 1000) + TTL_SECONDS,
    } satisfies OrgTokenClaims),
  );
  return `${payload}.${sign(payload, secret())}`;
}

/** Verifies a token. Present so tests can assert the contract the system relies on. */
export function verifyOrgToken(token: string, key: string = secret()): OrgTokenClaims | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = Buffer.from(sign(payload, key));
  const given = Buffer.from(signature);
  // Length is compared first: timingSafeEqual throws on a length mismatch, and
  // the length of an HMAC is not a secret.
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OrgTokenClaims;
    if (claims.v !== 1) return null;
    if (typeof claims.exp !== "number" || claims.exp * 1000 < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

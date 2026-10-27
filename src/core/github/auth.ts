import { createHmac, createSign, timingSafeEqual } from "node:crypto";

/**
 * GitHub App authentication primitives.
 *
 * Deliberately dependency-free: a GitHub App is a JWT signed RS256 with the
 * App's private key, exchanged for a short-lived installation token. Both are
 * a few lines of `node:crypto`, and `@octokit/*` would add a large transitive
 * surface (and its own release cadence) to a control plane whose whole job is
 * to be trustworthy. The protocol is implemented here instead, where it can be
 * read and tested.
 *
 * Everything in this file is pure — no DB, no network — so the two things that
 * must never be wrong (the signature GitHub verifies, and the signature we
 * verify from GitHub) are unit-testable.
 */

export interface GithubConfig {
  appId: string;
  /** PEM private key, newlines normalised. */
  privateKey: string;
  webhookSecret: string;
  /** App slug, for the browser install URL. */
  slug: string;
  /** Optional org login to scope repo browsing to, e.g. "BusinessOS-Campany". */
  org: string | null;
  /** Optional override for GitHub Enterprise Server. */
  apiBaseUrl: string;
}

/**
 * Reads the GitHub App configuration, or null when it is not set up.
 *
 * Missing configuration is a first-class state: the platform runs with no
 * GitHub integration at all, and the admin UI reports exactly which variables
 * are still required rather than failing a request with a stack trace.
 */
export function githubConfig(): GithubConfig | null {
  const appId = process.env.GITHUB_APP_ID?.trim();
  const privateKeyRaw = process.env.GITHUB_APP_PRIVATE_KEY?.trim();
  const webhookSecret = process.env.GITHUB_APP_WEBHOOK_SECRET?.trim();
  const slug = process.env.GITHUB_APP_SLUG?.trim();
  if (!appId || !privateKeyRaw || !webhookSecret || !slug) return null;
  return {
    appId,
    privateKey: normalisePem(privateKeyRaw),
    webhookSecret,
    slug,
    org: process.env.GITHUB_ORG?.trim() || null,
    apiBaseUrl: (process.env.GITHUB_API_BASE_URL?.trim() || "https://api.github.com").replace(/\/+$/, ""),
  };
}

/** Which of the required variables are absent, for an actionable message. */
export function missingGithubEnv(): string[] {
  const required = ["GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY", "GITHUB_APP_WEBHOOK_SECRET", "GITHUB_APP_SLUG"];
  return required.filter((name) => !process.env[name]?.trim());
}

/**
 * Accepts a PEM whether it arrived with real newlines (a `.env.local` value on
 * one line is written with `\n` escapes) or with literal backslash-n, which is
 * how a copy-pasted key usually lands.
 */
export function normalisePem(value: string): string {
  const unescaped = value.includes("\\n") ? value.replace(/\\n/g, "\n") : value;
  return unescaped.endsWith("\n") ? unescaped : `${unescaped}\n`;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/**
 * Builds the RS256 JWT GitHub accepts as `Authorization: Bearer <jwt>`.
 *
 * `iat` is backdated 60s and `exp` is 9 minutes out (GitHub caps it at 10) so a
 * mildly skewed clock on the server cannot produce an "issued in the future"
 * rejection. `exp`/`iat` are seconds, not milliseconds — a millisecond value
 * reads as a timestamp centuries away and is refused.
 */
export function createAppJwt(appId: string, privateKeyPem: string, nowMs: number = Date.now()): string {
  const iat = Math.floor(nowMs / 1000) - 60;
  const exp = iat + 540;
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({ iat, exp, iss: appId }));
  const signingInput = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256").update(signingInput).sign(privateKeyPem);
  return `${signingInput}.${base64url(signature)}`;
}

/**
 * Verifies a GitHub webhook signature (`X-Hub-Signature-256`).
 *
 * GitHub sends `sha256=<hex hmac of the raw request body>`. The comparison is
 * constant-time: a byte-by-byte early return leaks how much of a forged
 * signature was correct, which is exactly the information an attacker needs.
 * The raw body must be the bytes GitHub signed — a re-serialised JSON body will
 * not match, which is why the route handler reads the body as text first.
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader || !secret) return false;
  const [algorithm, provided] = signatureHeader.split("=");
  if (algorithm !== "sha256" || !provided) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(provided, "hex");
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}

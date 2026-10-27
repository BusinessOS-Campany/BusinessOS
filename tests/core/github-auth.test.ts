import { createHmac, createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createAppJwt,
  githubConfig,
  missingGithubEnv,
  normalisePem,
  verifyWebhookSignature,
} from "@/core/github/auth";

/**
 * The two signatures that decide whether the GitHub integration is safe:
 * the JWT we present to GitHub, and the HMAC we require from GitHub.
 */

describe("GitHub App JWT", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  it("signs a verifiable RS256 JWT with the App id as issuer", () => {
    const jwt = createAppJwt("123456", privateKey, 1_700_000_000_000);
    const [header, payload, signature] = jwt.split(".");
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" });

    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    expect(claims.iss).toBe("123456");
    // GitHub caps exp at 10 minutes; we aim well inside it.
    expect(claims.exp - claims.iat).toBe(540);
    // Backdated so a skewed clock cannot make it "issued in the future".
    expect(claims.iat).toBeLessThan(1_700_000_000);

    const verifier = createVerify("RSA-SHA256").update(`${header}.${payload}`);
    expect(verifier.verify(publicKey, Buffer.from(signature, "base64url"))).toBe(true);
  });

  it("uses seconds for iat/exp, not milliseconds", () => {
    const jwt = createAppJwt("1", privateKey, 1_700_000_000_000);
    const claims = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString());
    // A seconds epoch is ~1.7e9; a millisecond value would be ~1.7e12.
    expect(claims.exp).toBeGreaterThan(1_000_000_000);
    expect(claims.exp).toBeLessThan(100_000_000_000);
  });
});

describe("webhook signature verification", () => {
  const secret = "s3cr3t";
  const body = JSON.stringify({ ref: "refs/heads/main", hello: "world" });
  const valid = `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;

  it("accepts a signature GitHub would have sent", () => {
    expect(verifyWebhookSignature(body, valid, secret)).toBe(true);
  });

  it("rejects a tampered body", () => {
    expect(verifyWebhookSignature(`${body} `, valid, secret)).toBe(false);
  });

  it("rejects a wrong secret", () => {
    expect(verifyWebhookSignature(body, valid, "other")).toBe(false);
  });

  it("rejects a missing or malformed header", () => {
    expect(verifyWebhookSignature(body, null, secret)).toBe(false);
    expect(verifyWebhookSignature(body, "sha1=abc", secret)).toBe(false);
    expect(verifyWebhookSignature(body, "sha256=", secret)).toBe(false);
    expect(verifyWebhookSignature(body, valid, "")).toBe(false);
  });
});

describe("GitHub configuration", () => {
  it("normalises a PEM that arrived with literal backslash-n", () => {
    expect(normalisePem("line1\\nline2")).toBe("line1\nline2\n");
    expect(normalisePem("already\n")).toBe("already\n");
  });

  it("reports which variables are still required", () => {
    const names = ["GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY", "GITHUB_APP_WEBHOOK_SECRET", "GITHUB_APP_SLUG"];
    const saved = names.map((name) => [name, process.env[name]] as const);
    for (const name of names) delete process.env[name];
    try {
      expect(githubConfig()).toBeNull();
      expect(missingGithubEnv()).toEqual(names);
    } finally {
      for (const [name, value] of saved) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });
});

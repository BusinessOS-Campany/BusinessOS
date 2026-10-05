import "@/core/config/load-env";
import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { getEnv } from "@/core/config/env";
import { issueOrgToken, verifyOrgToken, type OrgTokenClaims } from "@/core/systems/runtime/org-token";

/** The key the platform actually signs with, so round-trips are meaningful. */
const SECRET = getEnv().AUTH_SECRET;

const claims = {
  organizationId: "afa52876-9fca-44c1-a318-67123ebe7dc8",
  organizationSlug: "p967775008926",
  userId: "bac71e4f-62a3-43ae-acb1-4c1",
  email: "owner@example.test",
  name: "Owner",
  role: "owner",
};

const sign = (payload: string, key = SECRET) =>
  createHmac("sha256", key).update(payload).digest("base64url");

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

/** A correctly signed token with chosen claims, for expiry/version cases. */
const forge = (overrides: Record<string, unknown>, key = SECRET) => {
  const payload = encode({ v: 1, ...claims, ...overrides });
  return `${payload}.${sign(payload, key)}`;
};

describe("org gateway token", () => {
  it("round-trips the identity the system needs to provision a local user", () => {
    const decoded = verifyOrgToken(issueOrgToken(claims));
    expect(decoded).toMatchObject({ v: 1, ...claims });
  });

  it("expires in minutes rather than days, so a captured token dies on its own", () => {
    const decoded = verifyOrgToken(issueOrgToken(claims))!;
    const ttl = decoded.exp - Math.floor(Date.now() / 1000);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(300);
  });

  it("is rejected when signed with a different secret", () => {
    // The point of the signature: a token minted elsewhere, or forged by
    // anything that reached the loopback port, must not verify.
    expect(verifyOrgToken(issueOrgToken(claims), "a-different-secret-entirely")).toBeNull();
    expect(verifyOrgToken(forge({}, "a-different-secret-entirely"))).toBeNull();
  });

  it("rejects a payload edited to name another org", () => {
    const [, signature] = issueOrgToken(claims).split(".");
    const swapped = encode({ v: 1, ...claims, organizationSlug: "someone-else" });
    expect(verifyOrgToken(`${swapped}.${signature}`)).toBeNull();
  });

  it("rejects a corrupted signature", () => {
    const [payload, signature] = issueOrgToken(claims).split(".");
    expect(verifyOrgToken(`${payload}.${signature.slice(0, -2)}xx`)).toBeNull();
  });

  it("rejects an expired token", () => {
    expect(verifyOrgToken(forge({ exp: Math.floor(Date.now() / 1000) - 1 }))).toBeNull();
    expect(verifyOrgToken(forge({ exp: Math.floor(Date.now() / 1000) + 300 })) as OrgTokenClaims)
      .not.toBeNull();
  });

  it("rejects a token with no usable expiry rather than treating it as valid", () => {
    expect(verifyOrgToken(forge({ exp: undefined }))).toBeNull();
    expect(verifyOrgToken(forge({ exp: "soon" }))).toBeNull();
  });

  it("rejects an unknown format version instead of misreading it", () => {
    expect(verifyOrgToken(forge({ v: 2 }))).toBeNull();
  });

  it("rejects malformed input instead of throwing", () => {
    for (const bad of ["", ".", "a.b", "no-dot-at-all", "...."]) {
      expect(verifyOrgToken(bad)).toBeNull();
    }
  });
});

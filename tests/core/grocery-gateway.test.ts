import "@/core/config/load-env";
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getEnv } from "@/core/config/env";
import { issueGroceryGatewayToken, verifyGroceryGatewayToken } from "@/core/auth/grocery-gateway";

describe("grocery gateway token", () => {
  it("round-trips tenant routing data", () => {
    const token = issueGroceryGatewayToken({
      organizationId: "org_test",
      userId: "user_test",
      role: "owner",
      schemaName: "grocery_acme",
    });
    expect(verifyGroceryGatewayToken(token)).toMatchObject({
      organizationId: "org_test",
      userId: "user_test",
      schemaName: "grocery_acme",
    });
  });

  it("always issues a schema-only token with no dedicated database", () => {
    const payload = verifyGroceryGatewayToken(
      issueGroceryGatewayToken({
        organizationId: "org_test",
        userId: "user_test",
        role: "owner",
        schemaName: "grocery_acme",
      }),
    );
    expect(payload?.databaseName).toBeNull();
  });

  it("rejects a correctly signed token that names a dedicated database", () => {
    // Signed with the real secret on purpose, so this exercises the
    // schema-only rule rather than the signature check: the grocery app must
    // not be pointed at a `bos_<slug>` database.
    const payload = {
      version: 1,
      organizationId: "org_test",
      userId: "user_test",
      role: "owner",
      schemaName: "grocery_acme",
      databaseName: "bos_acme",
      expiresAt: Math.floor(Date.now() / 1000) + 300,
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const sig = createHmac("sha256", getEnv().AUTH_SECRET).update(encoded).digest("base64url");
    expect(verifyGroceryGatewayToken(`${encoded}.${sig}`)).toBeNull();
  });

  it("rejects tampered tokens", () => {
    const token = issueGroceryGatewayToken({
      organizationId: "org_test",
      userId: "user_test",
      role: "owner",
      schemaName: "grocery_acme",
    });
    expect(verifyGroceryGatewayToken(`${token}tampered`)).toBeNull();
  });
});

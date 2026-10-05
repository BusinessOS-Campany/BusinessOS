import { createHmac, timingSafeEqual } from "crypto";
import { getEnv } from "@/core/config/env";

export interface GroceryGatewayPayload {
  version: 1;
  organizationId: string;
  userId: string;
  role: string;
  schemaName: string;
  /**
   * Retired. Tenants are schemas on one shared server, not dedicated
   * `bos_<slug>` databases. The field stays in the wire format because the
   * grocery app is a separate build that decodes this token, but nothing can
   * set it any more: `issueGroceryGatewayToken` always writes null, and a token
   * that carries a name is rejected so an old build cannot reach for a database
   * that is being removed. New builds should read `schemaName`.
   */
  databaseName: null;
  expiresAt: number;
}

function encode(value: string): string {
  return Buffer.from(value).toString("base64url");
}

function signature(value: string): string {
  return createHmac("sha256", getEnv().AUTH_SECRET).update(value).digest("base64url");
}

export function issueGroceryGatewayToken(
  input: Omit<GroceryGatewayPayload, "version" | "expiresAt" | "databaseName">,
): string {
  const payload: GroceryGatewayPayload = {
    ...input,
    version: 1,
    databaseName: null,
    expiresAt: Math.floor(Date.now() / 1000) + 300,
  };
  const encoded = encode(JSON.stringify(payload));
  return `${encoded}.${signature(encoded)}`;
}

export function verifyGroceryGatewayToken(token: string): GroceryGatewayPayload | null {
  const [encoded, suppliedSignature] = token.split(".");
  if (!encoded || !suppliedSignature) return null;
  const expectedSignature = signature(encoded);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString()) as GroceryGatewayPayload;
    if (
      payload.version !== 1 ||
      !payload.organizationId ||
      !payload.userId ||
      !payload.role ||
      !/^grocery_[a-z0-9_]{1,53}$/.test(payload.schemaName) ||
      // A dedicated-database token is from a build we no longer support.
      payload.databaseName !== null ||
      payload.expiresAt <= Math.floor(Date.now() / 1000)
    ) return null;
    return payload;
  } catch {
    return null;
  }
}

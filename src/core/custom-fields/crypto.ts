import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * AES-256-GCM for encrypted custom fields. Key derivation: APP_ENCRYPTION_KEY
 * (dev default documented in .env.example) → SHA-256 → 32-byte key.
 * Ciphertext format: "enc:v1:<iv_b64>:<tag_b64>:<data_b64>".
 */
const PREFIX = "enc:v1:";

function key(): Buffer {
  const secret = process.env.APP_ENCRYPTION_KEY ?? "bos-dev-encryption-key-DO-NOT-USE-IN-PROD";
  return createHash("sha256").update(secret).digest();
}

export function encryptValue(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${data.toString("base64")}`;
}

export function decryptValue(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored; // legacy/plain passthrough
  const [, , ivB64, tagB64, dataB64] = stored.split(":");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function isEncrypted(stored: string): boolean {
  return stored.startsWith(PREFIX);
}

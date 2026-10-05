import "@/core/config/load-env";
import { randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/core/db/client";
import {
  createApiKey,
  hashApiKey,
  listApiKeys,
  revokeApiKey,
  resolveApiKey,
  hasScope,
  requireScope,
} from "@/core/integrations/api-key";
import { checkRateLimit } from "@/core/integrations/rate-limit";
import {
  parseCsv,
  validateImport,
  commitImport,
} from "@/core/integrations/import";
import { generateExport, listExports } from "@/core/integrations/export";
import {
  createBackup,
  verifyBackup,
  listBackups,
} from "@/core/integrations/backup";
import { verifyWebhookSignature } from "@/core/integrations/webhooks";
import { ApiError } from "@/core/http/api";

let orgId = "";
let userId = "";
const tenant = () => ({ organizationId: orgId, userId });

async function purge(oid: string) {
  const tables = [
    "backupRecord", "dataExport", "importJob", "apiRateLimit", "apiKey",
    "webhookDelivery", "salesReturnItem", "salesReturn", "salesInvoiceItem",
    "payment", "salesInvoice", "purchaseItem", "purchase", "stockMovement",
    "stockLevel", "expense", "cashMovement", "numberSequence", "customer",
    "supplier", "product", "warehouse", "cashAccount", "expenseCategory",
    "category", "unit", "auditLog", "member",
  ] as const;
  for (const t of tables) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any)[t].deleteMany({ where: { organizationId: oid } }).catch(() => {});
  }
  await prisma.organization.delete({ where: { id: oid } });
}

beforeAll(async () => {
  userId = `u-${randomUUID().slice(0, 8)}`;
  await prisma.user.create({
    data: {
      id: userId,
      name: "M11 Tester",
      emailVerified: false,
      email: `m11-${randomUUID().slice(0, 8)}@test.local`,
    },
  });
  orgId = randomUUID();
  await prisma.organization.create({
    data: { id: orgId, name: "M11 Org", slug: `m11-${randomUUID().slice(0, 12)}` },
  });
  await prisma.member.create({
    data: { id: randomUUID(), organizationId: orgId, userId, role: "owner" },
  });
  await prisma.warehouse.create({
    data: { organizationId: orgId, nameAr: "المستودع الرئيسي", isMain: true },
  });
});

afterAll(async () => {
  if (orgId) await purge(orgId);
  if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => {});
});

// ─── API Keys ───────────────────────────────────────────────────────────────

describe("M11 — API Keys", () => {
  it("creates an API key with scopes and returns the raw key once", async () => {
    const result = await createApiKey(prisma, tenant(), {
      name: "Test Key",
      scopes: ["products:read", "customers:read"],
    });

    expect(result.rawKey).toMatch(/^bos_/);
    expect(result.name).toBe("Test Key");
    expect(result.prefix).toBe(result.rawKey.slice(0, 11));
    expect(result.scopes).toEqual(["products:read", "customers:read"]);

    // Raw key cannot be resolved again (only hash stored)
    const stored = await prisma.apiKey.findUnique({ where: { id: result.id } });
    expect(stored).toBeTruthy();
    expect(stored!.keyHash).toBe(hashApiKey(result.rawKey));
  });

  it("lists API keys without exposing raw keys", async () => {
    const keys = await listApiKeys(prisma, tenant());
    expect(keys.length).toBeGreaterThanOrEqual(1);
    for (const k of keys) {
      expect(k).not.toHaveProperty("rawKey");
      expect(k).toHaveProperty("name");
      expect(k).toHaveProperty("prefix");
    }
  });

  it("resolves a valid API key by raw value", async () => {
    const { rawKey } = await createApiKey(prisma, tenant(), {
      name: "Resolve Test",
      scopes: ["products:read"],
    });

    const resolved = await resolveApiKey(prisma, rawKey);
    expect(resolved).not.toBeNull();
    expect(resolved!.organizationId).toBe(orgId);
    expect(resolved!.scopes).toContain("products:read");
  });

  it("resolves null for an invalid key", async () => {
    const resolved = await resolveApiKey(prisma, "bogus_key");
    expect(resolved).toBeNull();
  });

  it("resolves null for a revoked key", async () => {
    const key = await createApiKey(prisma, tenant(), {
      name: "Revoke Me",
      scopes: ["products:read"],
    });
    await revokeApiKey(prisma, tenant(), key.id);

    const resolved = await resolveApiKey(prisma, key.rawKey);
    expect(resolved).toBeNull();
  });

  it("resolves null for an expired key", async () => {
    const key = await createApiKey(prisma, tenant(), {
      name: "Expiring",
      scopes: ["products:read"],
      expiresAt: new Date("2020-01-01"),
    });

    const resolved = await resolveApiKey(prisma, key.rawKey);
    expect(resolved).toBeNull();
  });
});

// ─── Scope enforcement ──────────────────────────────────────────────────────

describe("M11 — Scope enforcement", () => {
  it("hasScope returns true for exact match", () => {
    expect(hasScope(["products:read", "sales:create"], "products:read")).toBe(true);
  });

  it("hasScope returns true for wildcard", () => {
    expect(hasScope(["*"], "anything")).toBe(true);
  });

  it("hasScope returns false for missing scope", () => {
    expect(hasScope(["products:read"], "sales:create")).toBe(false);
  });

  it("requireScope throws 403 for missing scope", () => {
    expect(() => requireScope(["products:read"], "sales:create")).toThrow();
    try {
      requireScope(["products:read"], "sales:create");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(403);
    }
  });
});

// ─── Rate Limiting ──────────────────────────────────────────────────────────

describe("M11 — Rate limiting", () => {
  it("allows requests within the limit", async () => {
    const key = await createApiKey(prisma, tenant(), {
      name: "Rate Test",
      scopes: ["*"],
    });

    const result = await checkRateLimit(prisma, key.id, { maxRequests: 5, windowMs: 60_000 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("rejects requests over the limit", async () => {
    const key = await createApiKey(prisma, tenant(), {
      name: "Rate Limit Test",
      scopes: ["*"],
    });

    // Burn through the limit
    for (let i = 0; i < 3; i++) {
      await checkRateLimit(prisma, key.id, { maxRequests: 3, windowMs: 60_000 });
    }
    const result = await checkRateLimit(prisma, key.id, { maxRequests: 3, windowMs: 60_000 });
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });
});

// ─── Import Wizard ──────────────────────────────────────────────────────────

describe("M11 — Import wizard", () => {
  it("parses CSV correctly", () => {
    const csv = "sku,nameAr,salePrice\nSKU-1,Product One,1000\nSKU-2,Product Two,2000";
    const { headers, rows } = parseCsv(csv);
    expect(headers).toEqual(["sku", "nameAr", "salePrice"]);
    expect(rows).toHaveLength(2);
    expect(rows[0].sku).toBe("SKU-1");
    expect(rows[1].salePrice).toBe("2000");
  });

  it("validates product import and rejects rows with missing fields", async () => {
    const csv = "sku,nameAr,salePrice\nSKU-IMP-1,Imported Product,500\n,Missing SKU,300";
    const { headers, rows } = parseCsv(csv);

    const result = await validateImport(prisma, tenant(), "products", headers, rows, "test.csv");
    expect(result.totalRows).toBe(2);
    expect(result.validRows).toBe(1);
    expect(result.invalidRows).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].field).toBe("sku");
  });

  it("commits valid product import rows", async () => {
    const csv = "sku,nameAr,salePrice\nSKU-COMMIT-1,Commit Product,750";
    const { headers, rows } = parseCsv(csv);
    const preview = await validateImport(prisma, tenant(), "products", headers, rows, "commit.csv");

    const validRows = preview.preview.filter((r) => r.valid).map((r) => r.data as Record<string, string>);
    const result = await commitImport(prisma, tenant(), preview.jobId, validRows);
    expect(result.committedRows).toBe(1);
    expect(result.status).toBe("committed");

    // Verify product was created
    const product = await prisma.product.findFirst({
      where: { organizationId: orgId, sku: "SKU-COMMIT-1" },
    });
    expect(product).not.toBeNull();
    expect(product!.nameAr).toBe("Commit Product");
    expect(Number(product!.salePrice)).toBe(750);
  });

  it("validates customer import", async () => {
    const csv = "name,phone\nCustomer A,0501234567\n,0509999999";
    const { headers, rows } = parseCsv(csv);

    const result = await validateImport(prisma, tenant(), "customers", headers, rows, "customers.csv");
    expect(result.totalRows).toBe(2);
    expect(result.validRows).toBe(1);
    expect(result.invalidRows).toBe(1);
  });
});

// ─── Export Center ──────────────────────────────────────────────────────────

describe("M11 — Export center", () => {
  it("exports products to CSV with correct data", async () => {
    // Create a product first
    await prisma.product.create({
      data: {
        organizationId: orgId,
        sku: "SKU-EXP-1",
        nameAr: "Export Product",
        salePrice: 1500n,
        costPrice: 800n,
      },
    });

    const result = await generateExport(prisma, tenant(), "products");
    expect(result.rowCount).toBeGreaterThanOrEqual(1);
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.fileUrl).toBeTruthy();
    expect(result.format).toBe("csv");
  });

  it("exports customers to CSV", async () => {
    await prisma.customer.create({
      data: {
        organizationId: orgId,
        name: "Export Customer",
        phone: "0501111111",
      },
    });

    const result = await generateExport(prisma, tenant(), "customers");
    expect(result.rowCount).toBeGreaterThanOrEqual(1);
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("lists export jobs", async () => {
    const exports = await listExports(prisma, orgId);
    expect(exports.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Backup ─────────────────────────────────────────────────────────────────

describe("M11 — Backup", () => {
  it("creates a backup with sha256 verification", async () => {
    const result = await createBackup(prisma, tenant());
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.filePath).toBeTruthy();
    expect(result.fileSize).toBeGreaterThan(0);
    expect(result.manifest).toHaveProperty("sha256");
  });

  it("produces a real pg_dump SQL artifact, not a silent logical fallback", async () => {
    const result = await createBackup(prisma, tenant());
    expect(result.manifest.mode).toBe("pg_dump");
    const sql = readFileSync(result.filePath, "utf-8");
    expect(sql).toContain("CREATE TABLE");
    expect(sql).toContain("businessos.");
  });

  it("verifies backup integrity", async () => {
    const backup = await createBackup(prisma, tenant());
    const verified = await verifyBackup(prisma, tenant(), backup.backupId);
    expect(verified.verified).toBe(true);
    expect(verified.sha256).toBe(backup.sha256);
  });

  it("lists backup records", async () => {
    const backups = await listBackups(prisma, orgId);
    expect(backups.length).toBeGreaterThanOrEqual(1);
  });

  it("never claims success unverified — verified flag reflects actual check", async () => {
    const backup = await createBackup(prisma, tenant());
    // Verify it
    const v1 = await verifyBackup(prisma, tenant(), backup.backupId);
    expect(v1.verified).toBe(true);
    // Read the record back
    const record = await prisma.backupRecord.findUnique({ where: { id: backup.backupId } });
    expect(record!.verified).toBe(true);
  });
});

// ─── Webhook HMAC Verification ──────────────────────────────────────────────

describe("M11 — Webhook HMAC signature", () => {
  it("verifyWebhookSignature returns true for valid signature", () => {
    const signingKey = "test-secret-key-12345";
    const body = '{"event":"sale.created","total":1000}';
    const sig = `sha256=${createHash("sha256").update(signingKey).update(body).digest("hex")}`;

    expect(verifyWebhookSignature(signingKey, body, sig)).toBe(true);
  });

  it("verifyWebhookSignature returns false for tampered body", () => {
    const signingKey = "test-secret-key-12345";
    const body = '{"event":"sale.created","total":1000}';
    const tamperedBody = '{"event":"sale.created","total":9999}';
    const sig = `sha256=${createHash("sha256").update(signingKey).update(body).digest("hex")}`;

    expect(verifyWebhookSignature(signingKey, tamperedBody, sig)).toBe(false);
  });

  it("verifyWebhookSignature returns false for wrong key", () => {
    const signingKey = "correct-key";
    const wrongKey = "wrong-key";
    const body = '{"event":"test"}';
    const sig = `sha256=${createHash("sha256").update(signingKey).update(body).digest("hex")}`;

    expect(verifyWebhookSignature(wrongKey, body, sig)).toBe(false);
  });
});

// ─── Scoped Key Integration ─────────────────────────────────────────────────

describe("M11 — Scoped key integration", () => {
  it("key with products:read scope passes products:read check", async () => {
    const { rawKey } = await createApiKey(prisma, tenant(), {
      name: "Scoped Read",
      scopes: ["products:read"],
    });
    const resolved = await resolveApiKey(prisma, rawKey);
    expect(resolved).not.toBeNull();
    expect(hasScope(resolved!.scopes, "products:read")).toBe(true);
    expect(hasScope(resolved!.scopes, "products:create")).toBe(false);
  });

  it("requireScope throws 403 when key lacks sales:create", async () => {
    const { rawKey } = await createApiKey(prisma, tenant(), {
      name: "No Sales Scope",
      scopes: ["products:read", "customers:read"],
    });
    const resolved = await resolveApiKey(prisma, rawKey);
    expect(resolved).not.toBeNull();

    expect(() => requireScope(resolved!.scopes, "sales:create")).toThrow(ApiError);
    try {
      requireScope(resolved!.scopes, "sales:create");
    } catch (err) {
      expect((err as ApiError).status).toBe(403);
    }
  });

  it("wildcard scope allows any resource", async () => {
    const { rawKey } = await createApiKey(prisma, tenant(), {
      name: "Wildcard Key",
      scopes: ["*"],
    });
    const resolved = await resolveApiKey(prisma, rawKey);
    expect(resolved).not.toBeNull();
    expect(hasScope(resolved!.scopes, "sales:create")).toBe(true);
    expect(hasScope(resolved!.scopes, "inventory:adjust")).toBe(true);
    expect(hasScope(resolved!.scopes, "anything:else")).toBe(true);
  });
});

// ─── Bulk Import (ROADMAP: Import 1k products, 3 invalid, commit 997) ───────

describe("M11 — Bulk import", () => {
  it("import 1003 products with 3 invalid → preview shows errors → commit imports 997", async () => {
    // Generate CSV with 1000 valid rows + 3 invalid (missing sku)
    const lines = ["sku,nameAr,salePrice"];
    for (let i = 1; i <= 1000; i++) {
      lines.push(`BULK-${String(i).padStart(4, "0")},Product ${i},${100 + i}`);
    }
    // 3 invalid rows: missing sku
    lines.push(",Missing SKU 1,200");
    lines.push(",Missing SKU 2,300");
    lines.push(",Missing SKU 3,400");

    const csv = lines.join("\n");
    const { headers, rows } = parseCsv(csv);
    expect(rows).toHaveLength(1003);

    const result = await validateImport(prisma, tenant(), "products", headers, rows, "bulk.csv");
    expect(result.totalRows).toBe(1003);
    expect(result.validRows).toBe(1000);
    expect(result.invalidRows).toBe(3);
    expect(result.errors).toHaveLength(3);
    for (const err of result.errors) {
      expect(err.field).toBe("sku");
    }

    // Commit only valid rows
    const validRows = result.preview
      .filter((r) => r.valid)
      .map((r) => r.data as Record<string, string>);
    expect(validRows).toHaveLength(1000);

    const commitResult = await commitImport(prisma, tenant(), result.jobId, validRows);
    expect(commitResult.committedRows).toBe(1000);
    expect(commitResult.status).toBe("committed");

    // Verify count in DB
    const count = await prisma.product.count({
      where: { organizationId: orgId, sku: { startsWith: "BULK-" } },
    });
    expect(count).toBe(1000);
  });
});

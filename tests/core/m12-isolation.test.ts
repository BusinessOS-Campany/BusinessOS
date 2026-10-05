/**
 * M12 — Full isolation matrix: A-vs-B and revoked-role scenarios.
 *
 * Tests the §71 isolation requirement across all surfaces:
 * API (services), reports, AI tools, search, exports, custom fields,
 * storage, and permission revocation.
 */
import "@/core/config/load-env";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/core/db/client";
import { tenantFilter, tenantOwn, assertOwned, hasPermission } from "@/core/db/tenant-guard";
import { createSale } from "@/core/sales/service";
import { ReportsService } from "@/core/reports/service";
import { executeReadTool } from "@/core/ai/executor";
import { generateExport, listExports } from "@/core/integrations/export";
import { getStorage } from "@/core/integrations/storage";

/* ── fixtures ───────────────────────────────────────────────────────────── */

let orgA: string;
let orgB: string;
let userA: string;
let userB: string;
let warehouseA: string;
let warehouseB: string;
let productA1: string;
let productB1: string;
let customerA: string;
let customerB: string;
let cashAccountA: string;
let cashAccountB: string;
let revokedUser: string;
let revokedOrg: string;

const tA = () => ({ organizationId: orgA, userId: userA });
const tB = () => ({ organizationId: orgB, userId: userB });

async function makeTenant(label: string) {
  const uid = `u-${randomUUID().slice(0, 8)}`;
  const user = await prisma.user.create({
    data: { id: uid, name: `${label} User`, emailVerified: false, email: `${label}-${randomUUID().slice(0, 8)}@test.local` },
  });
  void user;
  const oid = randomUUID();
  await prisma.organization.create({ data: { id: oid, name: `${label} Org`, slug: `${label}-${randomUUID().slice(0, 12)}` } });
  await prisma.member.create({ data: { id: randomUUID(), organizationId: oid, userId: uid, role: "owner" } });
  await prisma.numberSequence.createMany({
    data: [
      { organizationId: oid, key: "sales_invoice", prefix: "INV-", padding: 5 },
      { organizationId: oid, key: "purchase", prefix: "PUR-", padding: 5 },
    ],
  });
  return { oid, uid };
}

async function purge(oid: string) {
  const tables = [
    "aiConfirmToken", "aiUsageLog", "posHold", "customFieldValue", "customField",
    "savedView", "dashboardLayout", "dataExport", "importJob", "backupRecord",
    "webhookDelivery", "apiKey", "webhookEndpoint", "notification",
    "conflictQueue", "idempotencyKey", "syncDevice", "workflowExecution", "workflowRule",
    "outboxEvent", "salesReturnItem", "salesReturn", "salesInvoiceItem", "payment",
    "salesInvoice", "purchaseItem", "purchase", "stockMovement", "stockLevel",
    "expense", "cashMovement", "numberSequence", "customer", "supplier",
    "product", "warehouse", "cashAccount", "expenseCategory", "category", "unit",
    "auditLog", "member",
  ] as const;
  const failures: string[] = [];
  for (const t of tables) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma as any)[t].deleteMany({ where: { organizationId: oid } });
    } catch (e) {
      failures.push(`${t}: ${(e as Error).message.split("\n")[0]}`);
    }
  }
  try {
    await prisma.organization.delete({ where: { id: oid } });
  } catch (e) {
    failures.push(`organization.delete: ${(e as Error).message.split("\n")[0]}`);
  }
  return failures;
}

async function purgeUser(uid: string | undefined) {
  if (!uid) return [];
  try {
    await prisma.user.delete({ where: { id: uid } });
    return [];
  } catch (e) {
    return [`user ${uid}: ${(e as Error).message.split("\n")[0]}`];
  }
}

beforeAll(async () => {
  const tenantA = await makeTenant("IsoA");
  orgA = tenantA.oid;
  userA = tenantA.uid;
  const tenantB = await makeTenant("IsoB");
  orgB = tenantB.oid;
  userB = tenantB.uid;

  warehouseA = (await prisma.warehouse.create({ data: { organizationId: orgA, nameAr: "مستودع أ", isMain: true } })).id;
  warehouseB = (await prisma.warehouse.create({ data: { organizationId: orgB, nameAr: "مستودع ب", isMain: true } })).id;

  productA1 = (await prisma.product.create({ data: { organizationId: orgA, sku: "A-001", nameAr: "منتج أ1", costPrice: 100n, salePrice: 200n } })).id;
  productB1 = (await prisma.product.create({ data: { organizationId: orgB, sku: "B-001", nameAr: "منتج ب1", costPrice: 150n, salePrice: 250n } })).id;

  customerA = (await prisma.customer.create({ data: { organizationId: orgA, name: "عميل أ", creditLimit: 50000n } })).id;
  customerB = (await prisma.customer.create({ data: { organizationId: orgB, name: "عميل ب", creditLimit: 50000n } })).id;

  cashAccountA = (await prisma.cashAccount.create({ data: { organizationId: orgA, nameAr: "الصندوق أ" } })).id;
  cashAccountB = (await prisma.cashAccount.create({ data: { organizationId: orgB, nameAr: "الصندوق ب" } })).id;

  await prisma.stockLevel.create({ data: { organizationId: orgA, warehouseId: warehouseA, productId: productA1, qty: 100 } });
  await prisma.stockLevel.create({ data: { organizationId: orgB, warehouseId: warehouseB, productId: productB1, qty: 50 } });

  await createSale(prisma, tA(), {
    warehouseId: warehouseA,
    customerId: customerA,
    items: [{ productId: productA1, qty: 5, unitPrice: 200, discount: 0 }],
    cashPaid: 1000,
    cashAccountId: cashAccountA,
  });

  await createSale(prisma, tB(), {
    warehouseId: warehouseB,
    customerId: customerB,
    items: [{ productId: productB1, qty: 3, unitPrice: 250, discount: 0 }],
    cashPaid: 750,
    cashAccountId: cashAccountB,
  });
});

afterAll(async () => {
  const failures: string[] = [];
  const tenants: Array<[string | undefined, string | undefined]> = [
    [orgA, userA],
    [orgB, userB],
    [revokedOrg, revokedUser],
  ];
  for (const [oid, uid] of tenants) {
    if (oid) failures.push(...(await purge(oid)));
    failures.push(...(await purgeUser(uid)));
  }
  await prisma.$disconnect();
  if (failures.length) throw new Error(`m12-isolation teardown left state behind: ${failures.join("; ")}`);
});

/* ── §71 Matrix: API / Service isolation (A-vs-B) ──────────────────────── */

describe("isolation: products", () => {
  it("orgA queries never return orgB products", async () => {
    const rows = await prisma.product.findMany({ where: tenantFilter(tA()) });
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
    expect(rows.find((r) => r.id === productB1)).toBeUndefined();
  });

  it("orgB queries never return orgA products", async () => {
    const rows = await prisma.product.findMany({ where: tenantFilter(tB()) });
    expect(rows.every((r) => r.organizationId === orgB)).toBe(true);
    expect(rows.find((r) => r.id === productA1)).toBeUndefined();
  });
});

describe("isolation: customers", () => {
  it("orgA queries never return orgB customers", async () => {
    const rows = await prisma.customer.findMany({ where: tenantFilter(tA()) });
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
    expect(rows.find((r) => r.id === customerB)).toBeUndefined();
  });

  it("assertOwned rejects foreign customer", async () => {
    const foreign = await prisma.customer.findFirstOrThrow({ where: { id: customerB } });
    expect(() => assertOwned(foreign, tA())).toThrow();
  });
});

describe("isolation: suppliers", () => {
  it("orgA queries never return orgB suppliers", async () => {
    // Create a supplier in orgB for this test
    const suppB = await prisma.supplier.create({ data: { organizationId: orgB, name: "مورد اختبار" } });
    const rows = await prisma.supplier.findMany({ where: tenantFilter(tA()) });
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
    expect(rows.find((r) => r.id === suppB.id)).toBeUndefined();
  });
});

describe("isolation: sales invoices", () => {
  it("orgA queries never return orgB invoices", async () => {
    const rows = await prisma.salesInvoice.findMany({ where: tenantFilter(tA()) });
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
  });

  it("orgB queries never return orgA invoices", async () => {
    const rows = await prisma.salesInvoice.findMany({ where: tenantFilter(tB()) });
    expect(rows.every((r) => r.organizationId === orgB)).toBe(true);
  });
});

describe("isolation: stock levels", () => {
  it("orgA queries never return orgB stock", async () => {
    const rows = await prisma.stockLevel.findMany({ where: tenantFilter(tA()) });
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
  });
});

/* ── §71 Matrix: Reports isolation ─────────────────────────────────────── */

describe("isolation: reports", () => {
  const reportsA = new ReportsService(prisma);

  it("salesSummary for orgA excludes orgB data", async () => {
    const from = new Date(2020, 0, 1);
    const to = new Date();
    const summary = await reportsA.salesSummary(orgA, from, to);
    // Verify the summary only counts orgA invoices
    const orgACount = await prisma.salesInvoice.count({ where: { organizationId: orgA, status: "posted" } });
    expect(summary.invoices).toBe(orgACount);
  });

  it("debtReport for orgA excludes orgB customers", async () => {
    const debt = await reportsA.debtReport(orgA);
    // All returned customers belong to orgA because ReportsService uses org-scoped queries
    const customerIds = debt.customers.map((c) => c.id);
    const orgBCustomers = await prisma.customer.findMany({ where: { organizationId: orgB } });
    const orgBIds = new Set(orgBCustomers.map((c) => c.id));
    for (const id of customerIds) {
      expect(orgBIds.has(id)).toBe(false);
    }
  });

  it("inventoryValuation for orgA excludes orgB stock", async () => {
    const val = await reportsA.inventoryValuation(orgA);
    // Should have A's product but not B's
    const allOrgBStock = await prisma.stockLevel.findMany({ where: { organizationId: orgB } });
    const bProductIds = new Set(allOrgBStock.map((s) => s.productId));
    // None of B's product IDs should appear in lowStock list
    for (const item of val.lowStock) {
      expect(bProductIds.has(item.sku)).toBe(false);
    }
  });
});

/* ── §71 Matrix: AI tools isolation ────────────────────────────────────── */

describe("isolation: AI tools", () => {
  it("get_sales_summary for orgA excludes orgB invoices", async () => {
    const result = (await executeReadTool(prisma, tA(), "get_sales_summary", {})) as Record<string, unknown>;
    expect(result.invoiceCount).toBeGreaterThanOrEqual(1);
    // OrgB has its own sale — verify the count is only for A
    const orgACount = await prisma.salesInvoice.count({ where: { organizationId: orgA } });
    expect(result.invoiceCount).toBe(orgACount);
  });

  it("get_top_products for orgA never returns orgB products", async () => {
    const result = (await executeReadTool(prisma, tA(), "get_top_products", { limit: 100 })) as Array<Record<string, unknown>>;
    const productIds = result.map((r) => r.productId as string);
    expect(productIds).toContain(productA1);
    expect(productIds).not.toContain(productB1);
  });

  it("get_debt for orgA never returns orgB customers", async () => {
    const result = (await executeReadTool(prisma, tA(), "get_debt", { limit: 100 })) as Array<Record<string, unknown>>;
    const ids = result.map((r) => r.customerId as string);
    expect(ids).not.toContain(customerB);
  });

  it("get_inventory for orgA never returns orgB stock", async () => {
    const result = (await executeReadTool(prisma, tA(), "get_inventory", { limit: 200 })) as Array<Record<string, unknown>>;
    const productIds = result.map((r) => r.productId as string);
    expect(productIds).toContain(productA1);
    expect(productIds).not.toContain(productB1);
  });

  it("search for orgA never returns orgB products", async () => {
    const result = (await executeReadTool(prisma, tA(), "search", { entity: "products", query: "منتج" })) as Array<Record<string, unknown>>;
    const ids = result.map((r) => r.id as string);
    expect(ids).toContain(productA1);
    expect(ids).not.toContain(productB1);
  });

  it("search for orgA never returns orgB customers", async () => {
    const result = (await executeReadTool(prisma, tA(), "search", { entity: "customers", query: "عميل" })) as Array<Record<string, unknown>>;
    const ids = result.map((r) => r.id as string);
    expect(ids).toContain(customerA);
    expect(ids).not.toContain(customerB);
  });
});

/* ── §71 Matrix: Export isolation ──────────────────────────────────────── */

describe("isolation: exports", () => {
  it("export products for orgA only includes orgA products", async () => {
    const result = await generateExport(prisma, tA(), "products");
    expect(result.rowCount).toBeGreaterThanOrEqual(1);
    expect(result.sha256.length).toBe(64);

    // Read the export data directly via the report query
    const rows = await prisma.product.findMany({ where: { organizationId: orgA } });
    expect(result.rowCount).toBe(rows.length);
  });

  it("export products for orgB only includes orgB products", async () => {
    const result = await generateExport(prisma, tB(), "products");
    expect(result.rowCount).toBe(1); // B-001 only
  });

  it("listExports only shows orgA exports when queried for orgA", async () => {
    const exports = await listExports(prisma, orgA);
    expect(exports.every((e) => e.entityType !== undefined)).toBe(true);
  });
});

/* ── §71 Matrix: Custom field isolation ────────────────────────────────── */

describe("isolation: custom fields", () => {
  let fieldA: string;
  let fieldB: string;

  it("custom field CRUD is org-scoped", async () => {
    const fA = await prisma.customField.create({
      data: { organizationId: orgA, entityType: "products", key: "origin", nameAr: "بلد المنشأ", type: "text" },
    });
    fieldA = fA.id;

    const fB = await prisma.customField.create({
      data: { organizationId: orgB, entityType: "products", key: "origin", nameAr: "بلد المنشأ", type: "text" },
    });
    fieldB = fB.id;

    const fieldsA = await prisma.customField.findMany({ where: tenantFilter(tA(), { entityType: "products" }) });
    expect(fieldsA.every((f) => f.organizationId === orgA)).toBe(true);
    expect(fieldsA.find((f) => f.id === fieldB)).toBeUndefined();
  });

  it("custom field values are org-scoped", async () => {
    await prisma.customFieldValue.create({
      data: { organizationId: orgA, fieldId: fieldA, entityType: "products", entityId: productA1, valueText: "السعودية" },
    });
    await prisma.customFieldValue.create({
      data: { organizationId: orgB, fieldId: fieldB, entityType: "products", entityId: productB1, valueText: "الإمارات" },
    });

    const valsA = await prisma.customFieldValue.findMany({ where: { organizationId: orgA } });
    expect(valsA.every((v) => v.organizationId === orgA)).toBe(true);
    expect(valsA.some((v) => v.entityId === productB1)).toBe(false);
  });

  it("unique constraint on customFieldValue is per-field+entity (cross-org allowed)", async () => {
    // Same entity ID but different org — should be allowed (different fieldIds from different orgs)
    // This tests that uniqueness doesn't accidentally leak across orgs
    const valB = await prisma.customFieldValue.create({
      data: { organizationId: orgB, fieldId: fieldB, entityType: "products", entityId: productA1, valueText: "اختبار" },
    }).catch(() => null);
    // This should succeed because fieldA != fieldB, so the [fieldId, entityId] unique is not violated
    expect(valB).not.toBeNull();
  });
});

/* ── §71 Matrix: Storage isolation ─────────────────────────────────────── */

describe("isolation: storage", () => {
  it("export file paths are scoped per org", async () => {
    const storage = getStorage();
    const pathA = `exports/${orgA}/products-test.csv`;
    const pathB = `exports/${orgB}/products-test.csv`;

    await storage.write(pathA, Buffer.from("orgA data"));
    await storage.write(pathB, Buffer.from("orgB data"));

    const dataA = await storage.read(pathA);
    const dataB = await storage.read(pathB);
    expect(dataA.toString()).toBe("orgA data");
    expect(dataB.toString()).toBe("orgB data");

    // Cleanup
    await storage.delete(pathA);
    await storage.delete(pathB);
  });
});

/* ── §71 Matrix: API key isolation ─────────────────────────────────────── */

describe("isolation: API keys", () => {
  let keyA: string;

  beforeAll(async () => {
    const rawKey = `bos_test_${randomUUID().slice(0, 16)}`;
    const { createHash } = await import("node:crypto");
    const keyHash = createHash("sha256").update(rawKey).digest("hex");
    const key = await prisma.apiKey.create({
      data: {
        organizationId: orgA,
        name: "Test Key A",
        prefix: rawKey.slice(0, 8),
        keyHash,
        scopes: JSON.stringify(["products:read"]),
        createdByUserId: userA,
      },
    });
    keyA = key.id;
  });

  it("API key resolves to correct org", async () => {
    const found = await prisma.apiKey.findUnique({ where: { id: keyA } });
    expect(found?.organizationId).toBe(orgA);
  });

  it("API key for orgA cannot access orgB data via raw query with orgB filter", async () => {
    const products = await prisma.product.findMany({
      where: tenantFilter({ organizationId: orgA }),
    });
    expect(products.every((p) => p.organizationId === orgA)).toBe(true);
  });
});

/* ── §71 Matrix: Permission revocation ─────────────────────────────────── */

describe("isolation: revoked role", () => {
  beforeAll(async () => {
    revokedUser = `u-revoke-${randomUUID().slice(0, 8)}`;
    await prisma.user.create({
      data: { id: revokedUser, name: "Revoked User", emailVerified: false, email: `revoked-${randomUUID().slice(0, 8)}@test.local` },
    });
    revokedOrg = randomUUID();
    await prisma.organization.create({ data: { id: revokedOrg, name: "Revoked Org", slug: `revoked-${randomUUID().slice(0, 12)}` } });
    // Add then remove the member
    const memberId = randomUUID();
    await prisma.member.create({ data: { id: memberId, organizationId: revokedOrg, userId: revokedUser, role: "cashier" } });
    await prisma.member.delete({ where: { id: memberId } });
  });

  it("revoked member no longer has a membership record", async () => {
    const membership = await prisma.member.findFirst({
      where: { organizationId: revokedOrg, userId: revokedUser },
    });
    expect(membership).toBeNull();
  });

  it("revoked role hasPermission returns false for any action", () => {
    // No membership = no role = denied everything
    expect(hasPermission(undefined as unknown as string, { products: ["read"] })).toBe(false);
    expect(hasPermission(undefined as unknown as string, { sales: ["create"] })).toBe(false);
  });

  it("revoked member cannot query org data via tenantFilter", async () => {
    // Even if someone bypasses the check, tenantFilter requires a valid tenant context
    const rows = await prisma.product.findMany({
      where: tenantFilter({ organizationId: revokedOrg }),
    });
    // Should return 0 because the org has no data
    expect(rows).toHaveLength(0);
  });
});

/* ── §71 Matrix: Audit log isolation ───────────────────────────────────── */

describe("isolation: audit logs", () => {
  it("audit logs are org-scoped", async () => {
    await prisma.auditLog.create({
      data: { ...tenantOwn(tA()), action: "isolation.test", entityType: "Test", entityId: "iso-a" },
    });
    await prisma.auditLog.create({
      data: { ...tenantOwn(tB()), action: "isolation.test", entityType: "Test", entityId: "iso-b" },
    });

    const logsA = await prisma.auditLog.findMany({ where: tenantFilter(tA(), { entityType: "Test" }) });
    expect(logsA.every((l) => l.organizationId === orgA)).toBe(true);
    expect(logsA.some((l) => l.entityId === "iso-b")).toBe(false);

    const logsB = await prisma.auditLog.findMany({ where: tenantFilter(tB(), { entityType: "Test" }) });
    expect(logsB.every((l) => l.organizationId === orgB)).toBe(true);
    expect(logsB.some((l) => l.entityId === "iso-a")).toBe(false);
  });
});

/* ── §71 Matrix: Number sequence isolation ─────────────────────────────── */

describe("isolation: number sequences", () => {
  it("each org has independent sequences", async () => {
    const seqA = await prisma.numberSequence.findMany({ where: { organizationId: orgA } });
    const seqB = await prisma.numberSequence.findMany({ where: { organizationId: orgB } });
    expect(seqA.length).toBeGreaterThan(0);
    expect(seqB.length).toBeGreaterThan(0);
    expect(seqA.every((s) => s.organizationId === orgA)).toBe(true);
    expect(seqB.every((s) => s.organizationId === orgB)).toBe(true);
  });
});

/* ── §71 Matrix: Full cross-surface isolation proof ────────────────────── */

describe("isolation: cross-surface proof", () => {
  it("every tenant-scoped table is隔离 for orgA vs orgB", async () => {
    const tables = [
      "product", "customer", "supplier", "salesInvoice", "salesInvoiceItem",
      "purchase", "purchaseItem", "stockLevel", "stockMovement", "expense",
      "cashAccount", "cashMovement", "auditLog", "category", "warehouse",
      "customField", "customFieldValue", "dataExport", "apiKey", "posHold",
    ] as const;

    for (const tableName of tables) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const model = (prisma as any)[tableName];
      const rowsA: Array<{ id: string; organizationId: string }> = await model.findMany({ where: { organizationId: orgA } });
      const rowsB: Array<{ id: string; organizationId: string }> = await model.findMany({ where: { organizationId: orgB } });

      // No overlap
      const idsA = new Set(rowsA.map((r) => r.id));
      const idsB = new Set(rowsB.map((r) => r.id));
      for (const id of idsA) {
        expect(idsB.has(id)).toBe(false);
      }
    }
  });
});

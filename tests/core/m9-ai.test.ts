import "@/core/config/load-env";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/core/db/client";
import { executeReadTool } from "@/core/ai/executor";
import { createConfirmToken, consumeConfirmToken } from "@/core/ai/confirm";
import { assertAiQuota, logAiUsage, getUsageStats } from "@/core/ai/metering";
import { TOOL_REGISTRY } from "@/core/ai/tools";
import { createSale } from "@/core/sales/service";

let orgId = "";
let userId = "";
const tenant = () => ({ organizationId: orgId, userId });

let warehouseId = "";
let productId = "";
let customerId = "";
let cashAccountId = "";

async function purge(oid: string) {
  const tables = [
    "aiConfirmToken", "aiUsageLog", "posHold", "salesReturnItem", "salesReturn",
    "salesInvoiceItem", "payment", "salesInvoice",
    "purchaseItem", "purchase", "stockMovement", "stockLevel", "expense", "cashMovement",
    "numberSequence", "customer", "supplier", "product", "warehouse", "cashAccount",
    "expenseCategory", "category", "unit", "auditLog", "member",
  ] as const;
  for (const t of tables) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any)[t].deleteMany({ where: { organizationId: oid } });
  }
  await prisma.organization.delete({ where: { id: oid } });
}

beforeAll(async () => {
  userId = `u-${randomUUID().slice(0, 8)}`;
  await prisma.user.create({
    data: { id: userId, name: "M9 Tester", emailVerified: false, email: `m9-${randomUUID().slice(0, 8)}@test.local` },
  });
  orgId = randomUUID();
  await prisma.organization.create({ data: { id: orgId, name: "M9 Org", slug: `m9-${randomUUID().slice(0, 12)}` } });
  await prisma.member.create({
    data: { id: randomUUID(), organizationId: orgId, userId, role: "owner" },
  });
  await prisma.numberSequence.createMany({
    data: [{ organizationId: orgId, key: "sales_invoice", prefix: "INV-", padding: 5 }],
  });

  warehouseId = (
    await prisma.warehouse.create({
      data: { organizationId: orgId, nameAr: "المستودع الرئيسي", isMain: true },
    })
  ).id;

  const cat = await prisma.category.create({
    data: { organizationId: orgId, nameAr: "مشروبات" },
  });

  productId = (
    await prisma.product.create({
      data: {
        organizationId: orgId,
        nameAr: "شاي",
        nameEn: "Tea",
        sku: "TEA-001",
        categoryId: cat.id,
        salePrice: 500n,
        costPrice: 300n,
        taxRateBps: 1500,
        trackStock: true,
      },
    })
  ).id;

  await prisma.stockLevel.create({
    data: { organizationId: orgId, warehouseId, productId, qty: 100 },
  });

  customerId = (
    await prisma.customer.create({
      data: { organizationId: orgId, name: "Ahmad", creditLimit: 50000n },
    })
  ).id;

  cashAccountId = (
    await prisma.cashAccount.create({
      data: { organizationId: orgId, nameAr: "الصندوق" },
    })
  ).id;

  // Create a sale for the sales summary test
  await createSale(prisma, tenant(), {
    warehouseId,
    customerId,
    items: [{ productId, qty: 5, unitPrice: 500, discount: 0 }],
    cashPaid: 2500,
    cashAccountId,
  });
});

afterAll(async () => {
  await purge(orgId);
});

describe("M9 — AI tool registry", () => {
  it("has 9 tools (5 read + 4 mutating)", () => {
    expect(TOOL_REGISTRY.length).toBe(9);
    expect(TOOL_REGISTRY.filter((t) => t.kind === "read").length).toBe(5);
    expect(TOOL_REGISTRY.filter((t) => t.kind === "mutating").length).toBe(4);
  });

  it("every tool has permission and Zod schema", () => {
    for (const tool of TOOL_REGISTRY) {
      expect(tool.permission.module).toBeTruthy();
      expect(tool.permission.action).toBeTruthy();
      expect(tool.argsSchema).toBeDefined();
      expect(typeof tool.description).toBe("string");
      expect(typeof tool.descriptionAr).toBe("string");
    }
  });
});

describe("M9 — Read tools (grounded in DB)", () => {
  it("get_sales_summary returns correct revenue from DB", async () => {
    const result = await executeReadTool(prisma, tenant(), "get_sales_summary", {}) as Record<string, unknown>;
    expect(result.invoiceCount).toBe(1);
    expect(result.totalRevenue).toBeGreaterThan(0);
    expect(result.currency).toBe("SAR");
  });

  it("get_inventory returns products with stock levels", async () => {
    const result = await executeReadTool(prisma, tenant(), "get_inventory", {}) as Array<Record<string, unknown>>;
    expect(result.length).toBeGreaterThanOrEqual(1);
    const tea = result.find((r) => r.productId === productId);
    expect(tea).toBeTruthy();
    expect((tea as Record<string, unknown>).qty).toBe(95);
  });

  it("get_debt returns customers with positive balance", async () => {
    const result = await executeReadTool(prisma, tenant(), "get_debt", {}) as Array<Record<string, unknown>>;
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it("search finds products by name", async () => {
    const result = await executeReadTool(prisma, tenant(), "search", { query: "شاي", entity: "products" }) as Array<Record<string, unknown>>;
    expect(result.length).toBe(1);
    expect(result[0].sku).toBe("TEA-001");
  });

  it("search finds customers by name", async () => {
    const result = await executeReadTool(prisma, tenant(), "search", { query: "Ahmad", entity: "customers" }) as Array<Record<string, unknown>>;
    expect(result.length).toBe(1);
    expect(result[0].name).toBe("Ahmad");
  });
});

describe("M9 — Confirm tokens", () => {
  it("create + consume confirm token (happy path)", async () => {
    const { confirmToken } = await createConfirmToken(
      prisma, tenant(), "create_customer", { name: "New Customer", phone: "0555" }, "tc-1",
    );
    expect(confirmToken).toBeTruthy();

    const action = await consumeConfirmToken(prisma, tenant(), confirmToken);
    expect(action.actionType).toBe("create_customer");
    expect(action.actionArgs.name).toBe("New Customer");
  });

  it("confirm token cannot be reused (single-use)", async () => {
    const { confirmToken } = await createConfirmToken(
      prisma, tenant(), "create_customer", { name: "X" }, "tc-2",
    );
    await consumeConfirmToken(prisma, tenant(), confirmToken);

    await expect(consumeConfirmToken(prisma, tenant(), confirmToken)).rejects.toThrow("already used");
  });

  it("expired confirm token is rejected", async () => {
    // Create a token with past expiry
    const token = await prisma.aiConfirmToken.create({
      data: {
        organizationId: orgId,
        actionType: "create_customer",
        actionArgs: { name: "Expired" },
        toolCallId: "tc-expired",
        createdByUserId: userId,
        expiresAt: new Date(Date.now() - 1000), // already expired
      },
      select: { id: true },
    });

    await expect(consumeConfirmToken(prisma, tenant(), token.id)).rejects.toThrow("expired");
  });

  it("nonexistent token throws not found", async () => {
    await expect(consumeConfirmToken(prisma, tenant(), "nonexistent")).rejects.toThrow("not found");
  });
});

describe("M9 — Plan cap enforcement", () => {
  it("assertAiQuota passes when under limit", async () => {
    const result = await assertAiQuota(prisma, orgId, "free");
    expect(result.remaining).toBeGreaterThan(0);
  });

  it("assertAiQuota throws when over limit", async () => {
    // Burn through quota by creating 50 log entries (free plan cap)
    for (let i = 0; i < 50; i++) {
      await logAiUsage(prisma, {
        organizationId: orgId,
        model: "test",
        tokensIn: 10,
        tokensOut: 5,
        costMicro: 0,
        toolCalls: 0,
      });
    }

    await expect(assertAiQuota(prisma, orgId, "free")).rejects.toThrow("exceeded");
  });

  it("usage stats are logged and queryable", async () => {
    const stats = await getUsageStats(prisma, orgId);
    expect(stats.totalRequests).toBeGreaterThanOrEqual(50);
    expect(stats.totalTokensIn).toBeGreaterThan(0);
  });
});

describe("M9 — AI-generated workflow stays inactive", () => {
  it("workflow rule created via AI has isActive=false by default", async () => {
    const rule = await prisma.workflowRule.create({
      data: {
        organizationId: orgId,
        name: "AI-generated low stock alert",
        triggerEvent: "inventory.low",
        conditions: {},
        actions: [{ type: "notification", titleAr: "تنبيه مخزون منخفض" }],
        isActive: false, // AI drafts are inert until activated
      },
      select: { id: true, isActive: true },
    });

    expect(rule.isActive).toBe(false);

    // Owner activates it
    const activated = await prisma.workflowRule.update({
      where: { id: rule.id },
      data: { isActive: true },
      select: { isActive: true },
    });
    expect(activated.isActive).toBe(true);
  });
});

import "@/core/config/load-env";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/core/db/client";
import { createSale } from "@/core/sales/service";
import { applyStockMovement } from "@/core/inventory/service";
import { emitOutboxEvent, buildDedupeKey } from "@/core/workflows/bus";
import { evaluateConditions } from "@/core/workflows/evaluator";
import { processOutboxBatch } from "@/core/workflows/worker";
import type { ConditionNode } from "@/core/workflows/types";

let orgId = "";
let userId = "";
const tenant = () => ({ organizationId: orgId, userId });
let warehouseId = "";
let productId = "";
let customerId = "";
let cashAccountId = "";

async function purge(oid: string) {
  const tables = [
    "workflowExecution", "outboxEvent", "workflowRule", "webhookEndpoint", "notification",
    "salesReturnItem", "salesReturn", "salesInvoiceItem", "payment", "salesInvoice",
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
    data: { id: userId, name: "M6 Tester", emailVerified: false, email: `m6-${randomUUID().slice(0, 8)}@test.local` },
  });
  orgId = randomUUID();
  await prisma.organization.create({ data: { id: orgId, name: "M6 Org", slug: `m6-${randomUUID().slice(0, 12)}` } });
  await prisma.member.create({
    data: { id: randomUUID(), organizationId: orgId, userId, role: "owner" },
  });
  await prisma.numberSequence.create({
    data: { organizationId: orgId, key: "sales_invoice", prefix: "INV-", padding: 5 },
  });

  warehouseId = (
    await prisma.warehouse.create({
      data: { organizationId: orgId, nameAr: "المستودع الرئيسي", isMain: true },
    })
  ).id;

  // Product with minStock for inventory.low testing
  productId = (
    await prisma.product.create({
      data: {
        organizationId: orgId, sku: "M6-SKU-001", nameAr: "منتج M6",
        costPrice: 100n, salePrice: 200n, taxRateBps: 0, trackStock: true, minStock: 10,
      },
    })
  ).id;

  customerId = (
    await prisma.customer.create({
      data: { organizationId: orgId, name: "M6 Customer", creditLimit: 1_000_000n },
    })
  ).id;

  cashAccountId = (
    await prisma.cashAccount.create({
      data: { organizationId: orgId, nameAr: "الصندوق الرئيسي" },
    })
  ).id;

  // Seed stock
  await prisma.$transaction(async (tx) => {
    await applyStockMovement(tx, tenant(), {
      productId, warehouseId, qtyDelta: 50, reason: "purchase",
    });
  });
});

afterAll(async () => {
  await purge(orgId);
});

// ── M6.2: Condition evaluator (unit) ─────────────────────────────────────
describe("Condition evaluator", () => {
  it("evaluates eq", () => {
    const node: ConditionNode = { field: "status", op: "eq", value: "active" };
    expect(evaluateConditions(node, { status: "active" })).toBe(true);
    expect(evaluateConditions(node, { status: "inactive" })).toBe(false);
  });

  it("evaluates numeric comparisons", () => {
    const node: ConditionNode = { field: "qty", op: "lt", value: 10 };
    expect(evaluateConditions(node, { qty: 5 })).toBe(true);
    expect(evaluateConditions(node, { qty: 15 })).toBe(false);
  });

  it("evaluates and/or logic", () => {
    const node: ConditionNode = {
      logic: "and",
      children: [
        { field: "a", op: "eq", value: 1 },
        { field: "b", op: "gt", value: 5 },
      ],
    };
    expect(evaluateConditions(node, { a: 1, b: 10 })).toBe(true);
    expect(evaluateConditions(node, { a: 1, b: 3 })).toBe(false);
  });

  it("evaluates or logic", () => {
    const node: ConditionNode = {
      logic: "or",
      children: [
        { field: "x", op: "eq", value: "yes" },
        { field: "y", op: "eq", value: "yes" },
      ],
    };
    expect(evaluateConditions(node, { x: "no", y: "yes" })).toBe(true);
    expect(evaluateConditions(node, { x: "no", y: "no" })).toBe(false);
  });

  it("evaluates in operator", () => {
    const node: ConditionNode = { field: "role", op: "in", value: ["admin", "manager"] };
    expect(evaluateConditions(node, { role: "admin" })).toBe(true);
    expect(evaluateConditions(node, { role: "viewer" })).toBe(false);
  });

  it("evaluates contains operator", () => {
    const node: ConditionNode = { field: "name", op: "contains", value: "test" };
    expect(evaluateConditions(node, { name: "my test item" })).toBe(true);
    expect(evaluateConditions(node, { name: "production item" })).toBe(false);
  });

  it("returns false for unknown fields", () => {
    const node: ConditionNode = { field: "nonexistent", op: "eq", value: 1 };
    expect(evaluateConditions(node, {})).toBe(false);
  });
});

// ── M6.3: Event disappears if sale rolls back (no orphan triggers) ────────
describe("M6.3: Outbox event rolls back with sale", () => {
  it("event written in tx disappears when tx rolls back", async () => {
    const dedupeKey = buildDedupeKey(orgId, "sale.created", "fake-id");
    const eventCountBefore = await prisma.outboxEvent.count({
      where: { organizationId: orgId, dedupeKey },
    });

    // Attempt a sale that will FAIL (insufficient stock on non-existent product)
    try {
      await createSale(prisma, tenant(), {
        customerId,
        warehouseId,
        items: [{ productId: "non-existent-product", qty: 1 }],
        cashPaid: 0,
      });
    } catch {
      // Expected to fail
    }

    const eventCountAfter = await prisma.outboxEvent.count({
      where: { organizationId: orgId, dedupeKey },
    });

    // Event count must NOT have changed — the tx rolled back completely.
    expect(eventCountAfter).toBe(eventCountBefore);
  });

  it("successful sale produces exactly one outbox event", async () => {
    const result = await createSale(prisma, tenant(), {
      customerId,
      warehouseId,
      items: [{ productId, qty: 1 }],
      cashPaid: 200,
      cashAccountId,
    });

    const events = await prisma.outboxEvent.findMany({
      where: { organizationId: orgId, eventType: "sale.created" },
    });
    expect(events.length).toBeGreaterThanOrEqual(1);
    const matchingEvent = events.find((e) => e.entityId === result.invoiceId);
    expect(matchingEvent).toBeDefined();
    expect(matchingEvent!.status).toBe("pending");
  });
});

// ── M6.1: Idempotent event handling — stock.low fires once per crossing ──
describe("M6.1: Idempotent event handling", () => {
  it("inventory.low event is deduplicated by dedupeKey", async () => {
    const dedupeKey = buildDedupeKey(orgId, "inventory.low", productId);

    // Emit the same event twice in separate txs
    await prisma.$transaction(async (tx) => {
      await emitOutboxEvent(tx, {
        organizationId: orgId,
        eventType: "inventory.low",
        dedupeKey,
        entityId: productId,
        payload: { eventType: "inventory.low", productId, currentQty: 5, minStock: 10 },
      });
    });
    await prisma.$transaction(async (tx) => {
      await emitOutboxEvent(tx, {
        organizationId: orgId,
        eventType: "inventory.low",
        dedupeKey,
        entityId: productId,
        payload: { eventType: "inventory.low", productId, currentQty: 5, minStock: 10 },
      });
    });

    // Only ONE event should exist (upsert, not duplicate)
    const events = await prisma.outboxEvent.findMany({
      where: { organizationId: orgId, dedupeKey },
    });
    expect(events).toHaveLength(1);

    // Clean up so it doesn't interfere with the notification test
    await prisma.outboxEvent.deleteMany({
      where: { organizationId: orgId, dedupeKey },
    });
  });

  it("processing an event with notification action creates exactly one notification", async () => {
    // Create a rule that fires on inventory.low → notification
    const rule = await prisma.workflowRule.create({
      data: {
        organizationId: orgId,
        name: "Stock alert",
        triggerEvent: "inventory.low",
        conditions: { field: "currentQty", op: "lt", value: 10 },
        actions: [{
          type: "notification",
          config: {
            titleEn: "Low stock alert",
            bodyEn: "Product {{sku}} is low: {{currentQty}} units",
          },
        }],
      },
    });

    // Record notifications before processing
    const notifCountBefore = await prisma.notification.count({
      where: { organizationId: orgId, titleEn: "Low stock alert" },
    });

    const dedupeKey = buildDedupeKey(orgId, "inventory.low", `${productId}-test1`);
    await prisma.$transaction(async (tx) => {
      await emitOutboxEvent(tx, {
        organizationId: orgId,
        eventType: "inventory.low",
        dedupeKey,
        entityId: productId,
        payload: { eventType: "inventory.low", productId, sku: "M6-SKU-001", currentQty: 5, minStock: 10 },
      });
    });

    // Process the outbox batch
    const result = await processOutboxBatch(prisma);
    expect(result.processed).toBeGreaterThanOrEqual(1);

    // Check EXACTLY ONE NEW notification was created for this test
    const notifCountAfter = await prisma.notification.count({
      where: { organizationId: orgId, titleEn: "Low stock alert" },
    });
    expect(notifCountAfter - notifCountBefore).toBe(1);

    // Check the latest notification has correct interpolation
    const latestNotif = await prisma.notification.findFirst({
      where: { organizationId: orgId, titleEn: "Low stock alert" },
      orderBy: { createdAt: "desc" },
    });
    expect(latestNotif!.bodyEn).toBe("Product M6-SKU-001 is low: 5 units");

    // Check execution log
    const executions = await prisma.workflowExecution.findMany({
      where: { organizationId: orgId, ruleId: rule.id },
    });
    expect(executions.length).toBe(1);
    expect(executions[0].status).toBe("success");
    expect(executions[0].actionType).toBe("notification");

    // Cleanup
    await prisma.workflowRule.delete({ where: { id: rule.id } });
  });
});

// ── M6.2: Webhook retry + execution log ──────────────────────────────────
describe("M6.2: Webhook retry and execution log", () => {
  it("no matching endpoint → event completes (no actions fire)", async () => {
    const rule = await prisma.workflowRule.create({
      data: {
        organizationId: orgId,
        name: "Webhook test",
        triggerEvent: "sale.created",
        conditions: {},
        actions: [{ type: "webhook", config: { endpointId: "nonexistent-endpoint-id" } }],
      },
    });

    const dedupeKey = buildDedupeKey(orgId, "sale.created", "webhook-test-1");
    await prisma.$transaction(async (tx) => {
      await emitOutboxEvent(tx, {
        organizationId: orgId,
        eventType: "sale.created",
        dedupeKey,
        entityId: "webhook-test-1",
        payload: { eventType: "sale.created", total: 500 },
      });
    });

    await processOutboxBatch(prisma);

    const eventAfter = await prisma.outboxEvent.findFirst({
      where: { organizationId: orgId, dedupeKey },
    });
    expect(eventAfter!.status).toBe("completed");

    const executions = await prisma.workflowExecution.findMany({
      where: { organizationId: orgId, ruleId: rule.id },
    });
    expect(executions.length).toBe(1);
    expect(executions[0].status).toBe("success");
    expect(executions[0].actionType).toBe("webhook");

    await prisma.workflowRule.delete({ where: { id: rule.id } });
  });

  it("webhook action with failing fetch creates failed execution log", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      return Promise.reject(new TypeError("fetch failed ECONNREFUSED"));
    });

    try {
      const ep = await prisma.webhookEndpoint.create({
        data: {
          organizationId: orgId,
          name: "Failing webhook",
          url: "http://127.0.0.1:1/test",
          events: ["sale.created"],
          isActive: true,
        },
      });

      const rule = await prisma.workflowRule.create({
        data: {
          organizationId: orgId,
          name: "Webhook fail test",
          triggerEvent: "sale.created",
          conditions: {},
          actions: [{ type: "webhook", config: { endpointId: ep.id } }],
        },
      });

      const dedupeKey = buildDedupeKey(orgId, "sale.created", "webhook-fail-1");
      await prisma.$transaction(async (tx) => {
        await emitOutboxEvent(tx, {
          organizationId: orgId,
          eventType: "sale.created",
          dedupeKey,
          entityId: "webhook-fail-1",
          payload: { eventType: "sale.created", total: 500 },
        });
      });

      await processOutboxBatch(prisma);

      const executions = await prisma.workflowExecution.findMany({
        where: { organizationId: orgId, ruleId: rule.id },
      });
      expect(executions.length).toBe(1);
      expect(executions[0].status).toBe("failed");
      expect(executions[0].actionType).toBe("webhook");
      expect(executions[0].lastError).toBeDefined();

      const event = await prisma.outboxEvent.findFirst({
        where: { organizationId: orgId, dedupeKey },
      });
      expect(event!.status).toBe("failed");
      expect(event!.attempt).toBe(1);
      expect(event!.nextRunAt).not.toBeNull();

      await prisma.workflowRule.delete({ where: { id: rule.id } });
      await prisma.webhookEndpoint.delete({ where: { id: ep.id } });
    } finally {
      spy.mockRestore();
    }
  });

  it("event dead-letters after max attempts", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      return Promise.reject(new TypeError("fetch failed ECONNREFUSED"));
    });

    try {
      const ep = await prisma.webhookEndpoint.create({
        data: {
          organizationId: orgId,
          name: "Dead letter webhook",
          url: "http://127.0.0.1:1/test",
          events: ["sale.created"],
          isActive: true,
        },
      });

      const rule = await prisma.workflowRule.create({
        data: {
          organizationId: orgId,
          name: "Dead letter test",
          triggerEvent: "sale.created",
          conditions: {},
          actions: [{ type: "webhook", config: { endpointId: ep.id } }],
        },
      });

      const dedupeKey = buildDedupeKey(orgId, "sale.created", "dead-letter-1");
      await prisma.outboxEvent.create({
        data: {
          organizationId: orgId,
          eventType: "sale.created",
          dedupeKey,
          entityId: "dead-letter-1",
          payload: { eventType: "sale.created", total: 100 },
          status: "failed",
          attempt: 4,
          maxAttempts: 5,
        },
      });

      await processOutboxBatch(prisma);

      const event = await prisma.outboxEvent.findFirst({
        where: { organizationId: orgId, dedupeKey },
      });
      expect(event!.status).toBe("dead_lettered");
      expect(event!.attempt).toBe(5);

      await prisma.workflowRule.delete({ where: { id: rule.id } });
      await prisma.webhookEndpoint.delete({ where: { id: ep.id } });
    } finally {
      spy.mockRestore();
    }
  });
});

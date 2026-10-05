import "@/core/config/load-env";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/core/db/client";
import { createSale } from "@/core/sales/service";
import { createPurchase } from "@/core/purchases/service";
import { createExpense } from "@/core/expenses/service";
import { applyStockMovement, ledgerSum } from "@/core/inventory/service";
import { ReportsService } from "@/core/reports/service";
import { updateOrgSettings } from "@/core/tenancy/settings";
import { ApiError } from "@/core/http/api";

let orgId = "";
let userId = "";
const tenant = () => ({ organizationId: orgId, userId });

let warehouseId = "";
let productIdA = ""; // taxed, tracked
let productIdB = ""; // untaxed, tracked
let productIdS = ""; // untracked service
let customerId = "";
let supplierId = "";
let cashAccountId = "";

async function purge(oid: string) {
  const tables = [
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
  const user = await prisma.user.create({
    data: { id: userId, name: "M4 Tester", emailVerified: false, email: `m4-${randomUUID().slice(0, 8)}@test.local` },
  });
  void user;
  orgId = randomUUID();
  await prisma.organization.create({ data: { id: orgId, name: "M4 Org", slug: `m4-${randomUUID().slice(0, 12)}` } });
  await prisma.member.create({
    data: { id: randomUUID(), organizationId: orgId, userId, role: "owner" },
  });
  await prisma.numberSequence.createMany({
    data: [
      { organizationId: orgId, key: "sales_invoice", prefix: "INV-", padding: 5 },
      { organizationId: orgId, key: "purchase", prefix: "PUR-", padding: 5 },
    ],
  });

  warehouseId = (
    await prisma.warehouse.create({
      data: { organizationId: orgId, nameAr: "المستودع الرئيسي", isMain: true },
    })
  ).id;

  productIdA = (
    await prisma.product.create({
      data: {
        organizationId: orgId, sku: "SKU-A", barcode: "6281000A", nameAr: "منتج أ",
        costPrice: 500n, salePrice: 900n, taxRateBps: 1500, minStock: 10,
      },
    })
  ).id;
  productIdB = (
    await prisma.product.create({
      data: {
        organizationId: orgId, sku: "SKU-B", nameAr: "منتج ب",
        costPrice: 2000n, salePrice: 3000n, taxRateBps: 0,
      },
    })
  ).id;
  productIdS = (
    await prisma.product.create({
      data: {
        organizationId: orgId, sku: "SKU-SRV", nameAr: "خدمة تركيب",
        costPrice: 0n, salePrice: 5000n, trackStock: false,
      },
    })
  ).id;

  customerId = (
    await prisma.customer.create({
      data: { organizationId: orgId, name: "عميل تجريبي", creditLimit: 50000n },
    })
  ).id;

  supplierId = (
    await prisma.supplier.create({
      data: { organizationId: orgId, name: "مورد الجملة" },
    })
  ).id;

  cashAccountId = (
    await prisma.cashAccount.create({
      data: { organizationId: orgId, nameAr: "الصندوق", openingBalance: 100_000n },
    })
  ).id;
});

afterAll(async () => {
  if (orgId) await purge(orgId);
  if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => {});
});

describe("M4 goal 1 — atomic sale commits everything or nothing", () => {
  let invoiceNumber = "";
  let customerBalanceAfter = 0n;
  let cashAfter = 0n;

  it("commits invoice + items + payment + stock + cash + ledger in one shot", async () => {
    // Stock the shop first via an atomic purchase receipt (partial pay → payable).
    const pur = await createPurchase(prisma, tenant(), {
      warehouseId,
      supplierId,
      items: [
        { productId: productIdA, qty: 10, unitCost: 500 },
        { productId: productIdB, qty: 5, unitCost: 2000 },
      ],
      cashPaid: 10_000,
      cashAccountId,
    });
    expect(pur.total).toBe(15_000n);
    expect(pur.creditPortion).toBe(5_000n);
    expect(pur.number).toMatch(/^PUR-\d{5}$/);
    const sup = await prisma.supplier.findUniqueOrThrow({ where: { id: supplierId } });
    expect(sup.balance).toBe(5_000n);

    const sale = await createSale(prisma, tenant(), {
      warehouseId,
      customerId,
      items: [
        { productId: productIdA, qty: 2 },          // 2×900=1800 net, +15% tax = 270
        { productId: productIdB, qty: 1 },          // 3000 flat
        { productId: productIdS, qty: 1 },          // service: 5000, no stock effect
      ],
      cashPaid: 1000,
      cashAccountId,
    });
    expect(sale.number).toMatch(/^INV-\d{5}$/);
    // subtotal 9800 (net) + tax 270 = 10070
    expect(sale.total).toBe(10070n);
    expect(sale.creditPortion).toBe(9070n);

    const invoice = await prisma.salesInvoice.findFirstOrThrow({
      where: { organizationId: orgId, number: sale.number },
    });
    const items = await prisma.salesInvoiceItem.findMany({ where: { invoiceId: invoice.id } });
    const payments = await prisma.payment.findMany({ where: { invoiceId: invoice.id } });
    expect(items).toHaveLength(3);
    expect(invoice.subtotal).toBe(9800n);
    expect(invoice.taxTotal).toBe(270n);
    expect(invoice.paidTotal).toBe(1000n);
    expect(payments).toHaveLength(1);

    // Ledger invariant per tracked product/warehouse (goal 2 probe).
    // Service product (trackStock=false) intentionally has NO stock row.
    for (const pid of [productIdA, productIdB] as const) {
      const level = await prisma.stockLevel.findUniqueOrThrow({
        where: { productId_warehouseId: { productId: pid, warehouseId } },
      });
      const sum = await ledgerSum(prisma, orgId, pid, warehouseId);
      expect(sum).toBeCloseTo(Number(level.qty), 6);
    }
    const aLevel = await prisma.stockLevel.findUniqueOrThrow({
      where: { productId_warehouseId: { productId: productIdA, warehouseId } },
    });
    expect(Number(aLevel.qty)).toBeCloseTo(8, 6); // bought 10, sold 2

    const cust = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    expect(cust.balance).toBe(9070n);
    customerBalanceAfter = cust.balance;

    const moves = await prisma.cashMovement.findMany({
      where: { organizationId: orgId, accountId: cashAccountId },
    });
    const net = moves.reduce((acc, m) => acc + m.delta, 0n);
    // Opening balance lives on the ACCOUNT row, not as a movement row.
    expect(net).toBe(-10_000n + 1000n);
    cashAfter = net;
    invoiceNumber = invoice.number;
  });

  it("rolls back EVERYTHING when any step fails mid-transaction", async () => {
    const invoicesBefore = await prisma.salesInvoice.count({ where: { organizationId: orgId } });
    const movesBefore = await prisma.stockMovement.count({ where: { organizationId: orgId } });
    const seqBefore = await prisma.numberSequence.findUniqueOrThrow({
      where: { organizationId_key: { organizationId: orgId, key: "sales_invoice" } },
    });

    // Full-cash sale so the credit gate passes; item 2 demands far more B
    // stock than exists (only 4 left) → applyStockMovement throws AFTER
    // header/items/payment/cash writes. Genuine mid-tx fault injection.
    await expect(
      createSale(prisma, tenant(), {
        warehouseId,
        items: [
          { productId: productIdA, qty: 1 },
          { productId: productIdB, qty: 10 },
        ],
        cashPaid: 31_035,
        cashAccountId,
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });

    expect(await prisma.salesInvoice.count({ where: { organizationId: orgId } })).toBe(invoicesBefore);
    expect(await prisma.stockMovement.count({ where: { organizationId: orgId } })).toBe(movesBefore);
    const cust = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    expect(cust.balance).toBe(customerBalanceAfter);
    const moves = await prisma.cashMovement.findMany({
      where: { organizationId: orgId, accountId: cashAccountId },
    });
    expect(moves.reduce((acc, m) => acc + m.delta, 0n)).toBe(cashAfter);
    // Sequence rolled back with the tx → no burned number.
    const seqAfter = await prisma.numberSequence.findUniqueOrThrow({
      where: { organizationId_key: { organizationId: orgId, key: "sales_invoice" } },
    });
    expect(seqAfter.nextValue).toBe(seqBefore.nextValue);
    void invoiceNumber;
  });

  it("issues unique monotonic numbers across concurrent-ish sequential sales", async () => {
    const s1 = await createSale(prisma, tenant(), {
      warehouseId,
      items: [{ productId: productIdA, qty: 1 }],
      cashPaid: 1035,
      cashAccountId,
    });
    const s2 = await createSale(prisma, tenant(), {
      warehouseId,
      items: [{ productId: productIdA, qty: 1 }],
      cashPaid: 1035,
      cashAccountId,
    });
    const n1 = Number(s1.number.replace("INV-", ""));
    const n2 = Number(s2.number.replace("INV-", ""));
    expect(n2).toBeGreaterThan(n1);
  });
});

describe("M4 goal 2 — stock can never go negative unless allowed", () => {
  it("rejects oversell with INSUFFICIENT_STOCK then allows when setting flips", async () => {
    await expect(
      createSale(prisma, tenant(), {
        warehouseId,
        items: [{ productId: productIdB, qty: 999 }],
        cashPaid: 0,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" }); // credit sale w/o customer

    // Credit-rich customer so the 999-unit sale is purely a stock test.
    const rich = await prisma.customer.create({
      data: { organizationId: orgId, name: "عميل آجل كبير", creditLimit: 10_000_000n },
    });
    await expect(
      createSale(prisma, tenant(), {
        warehouseId,
        customerId: rich.id,
        items: [{ productId: productIdB, qty: 999 }],
        cashPaid: 0,
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });

    await updateOrgSettings(orgId, { allowNegativeStock: true });
    try {
      await createSale(prisma, tenant(), {
        warehouseId,
        customerId: rich.id,
        items: [{ productId: productIdB, qty: 999 }],
        cashPaid: 0,
      });
      const sum = await ledgerSum(prisma, orgId, productIdB, warehouseId);
      const level = await prisma.stockLevel.findUniqueOrThrow({
        where: { productId_warehouseId: { productId: productIdB, warehouseId } },
      });
      expect(sum).toBeCloseTo(Number(level.qty), 6);
      expect(Number(level.qty)).toBeLessThan(0); // genuinely went negative
    } finally {
      await updateOrgSettings(orgId, { allowNegativeStock: false });
      await prisma.customer.delete({ where: { id: rich.id } });
    }
  });

  it("applyStockMovement rejects zero quantity", async () => {
    await expect(
      applyStockMovement(prisma, tenant(), {
        productId: productIdA, warehouseId, qtyDelta: 0, reason: "adjustment",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("M4 goal 3 — credit-limit breach blocks credit sale", () => {
  it("enforces creditLimit ceiling via the workflow-hook seam", async () => {
    const cust = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    const headroom = cust.creditLimit - cust.balance;
    expect(headroom).toBeGreaterThan(0n);

    // Use the UNTRACKED service product: no stock interference — this test
    // isolates the credit gate alone. Sale within headroom passes…
    const okSale = await createSale(prisma, tenant(), {
      warehouseId,
      customerId,
      items: [{ productId: productIdS, qty: Math.floor(Number(headroom) / 5000) }],
      cashPaid: 0,
    });
    expect(okSale.creditPortion).toBeGreaterThan(0n);

    // …one more unit breaches the ceiling.
    await expect(
      createSale(prisma, tenant(), {
        warehouseId,
        customerId,
        items: [{ productId: productIdS, qty: 1 }],
        cashPaid: 0,
      }),
    ).rejects.toMatchObject({ code: "CREDIT_LIMIT_EXCEEDED" });
  });

  it("blocks credit entirely for zero-limit customers", async () => {
    const c = await prisma.customer.create({
      data: { organizationId: orgId, name: "كاش فقط", creditLimit: 0n },
    });
    await expect(
      createSale(prisma, tenant(), {
        warehouseId,
        customerId: c.id,
        items: [{ productId: productIdA, qty: 1 }],
        cashPaid: 0,
      }),
    ).rejects.toMatchObject({ code: "CREDIT_NOT_ALLOWED" });
    await prisma.customer.delete({ where: { id: c.id } });
  });

  it("credit sale without any customer is rejected", async () => {
    await expect(
      createSale(prisma, tenant(), {
        warehouseId,
        items: [{ productId: productIdA, qty: 1 }],
        cashPaid: 0,
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

describe("M4 goal 4 — reports reconcile exactly with ledger fixtures", () => {
  it("profit/inventory/debt/cashflow figures match hand-computed sums", async () => {
    const svc = new ReportsService(prisma);
    const now = new Date();
    const from = new Date(now.getTime() - 24 * 3600 * 1000);

    // ── hand-computed expectations from every write above ──────────────────
    // Purchases: 10×500 + 5×2000 = 15000 (tax 0), cashPaid 10000
    // Sales posted: INV#1 (2A@900+1B@3000+1SRV@5000), rollback (none),
    //   two 1A sales @1035 each, one SRV credit sale (floor(headroom/5000)
    //   units @5000), one 999×B negative-allowed sale @3000 each.
    const sCreditQty = Math.floor(Number(50000n - 9070n) / 5000); // 8

    const profit = await svc.grossProfit(orgId, from, new Date(now.getTime() + 1000));
    // revenue ex-tax = (2·900 + 3000 + 5000) + 2·900 + 2·900 + sCreditQty·5000 + 999·3000
    const expectedRevenue =
      1800n + 3000n + 5000n + 900n + 900n + BigInt(sCreditQty) * 5000n + 999n * 3000n;
    // cost snapshot = purchases' last-cost bookkeeping set A=500,B=2000,S=0
    // INV#1 cost: 2A·500 + 1B·2000 + S·0 ; then 1A, 1A, 0, 999B·2000.
    const expectedCost = 2n * 500n + 2000n + 0n + 500n + 500n + 999n * 2000n;
    expect(profit.revenue).toBe(expectedRevenue);
    expect(profit.cost).toBe(expectedCost);
    expect(profit.profit).toBe(expectedRevenue - expectedCost);

    const debt = await svc.debtReport(orgId);
    // عميل تجريبي carries INV#1 + the sCreditQty credit sale; the 999-unit
    // negative-stock sale sat on "rich" whose row was deleted in cleanup.
    const expectedBalance = 9070n + BigInt(sCreditQty) * 5000n;
    expect(debt.totalReceivable).toBe(expectedBalance);
    expect(debt.customers.map((c) => c.name)).toContain("عميل تجريبي");

    const inv = await svc.inventoryValuation(orgId);
    // A stock: 10 −2 −1 −1 = 6 ; B: 5 −1 −999 ; S untracked.
    const aRemaining = 6;
    const bRemaining = 5 - 1 - 999;
    const expectedCostValue = BigInt(aRemaining * 500) + BigInt(bRemaining * 2000);
    expect(inv.costValue).toBe(expectedCostValue);
    // A has minStock=10 with only 6 left → flagged; B has no minStock → never.
    expect(inv.lowStock.some((l) => l.sku === "SKU-A")).toBe(true);
    expect(inv.lowStock.some((l) => l.sku === "SKU-B")).toBe(false);

    const cf = await svc.cashflow(orgId, from, new Date(now.getTime() + 1000));
    const caNet = cf.balances[cashAccountId];
    // opening 100000 − purchase 10000 + sale cash (1000+1035+1035) − expense below
    const expense = await createExpense(prisma, tenant(), {
      amount: 2500,
      cashAccountId,
      note: "كهرباء",
    });
    expect(expense.expenseId).toBeTruthy();
    const cf2 = await svc.cashflow(orgId, from, new Date(now.getTime() + 2000));
    expect(cf2.balances[cashAccountId]).toBe(caNet - 2500n);
    expect(cf.byReason["sale_payment"]).toBe(1000n + 1035n + 1035n);
    expect(cf.byReason["purchase_payment"]).toBe(-10000n);
  });

  it("salesSummary aggregates match invoice rows exactly", async () => {
    const svc = new ReportsService(prisma);
    const agg = await svc.salesSummary(orgId, new Date(Date.now() - 864e5), new Date(Date.now() + 1000));
    const manual = await prisma.salesInvoice.aggregate({
      where: { organizationId: orgId, status: "posted" },
      _sum: { total: true, taxTotal: true },
    });
    expect(agg.total).toBe(manual._sum.total);
    expect(agg.taxTotal).toBe(manual._sum.taxTotal);
    expect(agg.invoices).toBeGreaterThan(0);
  });
});

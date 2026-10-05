import "@/core/config/load-env";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/core/db/client";
import { holdCart, listHolds, resumeCart, deleteHold, payFromHold } from "@/core/pos/service";
import { generateReceipt } from "@/core/pos/receipt";
import type { ReceiptData, ReceiptBranding } from "@/core/pos/types";

let orgId = "";
let userId = "";
const tenant = () => ({ organizationId: orgId, userId });

let warehouseId = "";
let productId = "";
let customerId = "";
let cashAccountId = "";

async function purge(oid: string) {
  const tables = [
    "posHold", "salesReturnItem", "salesReturn", "salesInvoiceItem", "payment", "salesInvoice",
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
    data: { id: userId, name: "M8 Tester", emailVerified: false, email: `m8-${randomUUID().slice(0, 8)}@test.local` },
  });
  orgId = randomUUID();
  await prisma.organization.create({ data: { id: orgId, name: "M8 Org", slug: `m8-${randomUUID().slice(0, 12)}` } });
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
    data: { organizationId: orgId, nameAr: " Beverages" },
  });
  const unit = await prisma.unit.create({
    data: { organizationId: orgId, nameAr: "حبة", nameEn: "pc", factor: 1, isBase: true },
  });

  productId = (
    await prisma.product.create({
      data: {
        organizationId: orgId,
        nameAr: "شاي",
        nameEn: "Tea",
        sku: "TEA-001",
        categoryId: cat.id,
        baseUnitId: unit.id,
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
      data: { organizationId: orgId, name: "POS Customer", creditLimit: 100000n },
    })
  ).id;

  cashAccountId = (
    await prisma.cashAccount.create({
      data: { organizationId: orgId, nameAr: "الصندوق الرئيسي" },
    })
  ).id;
});

afterAll(async () => {
  await purge(orgId);
});

describe("M8 — POS hold / resume / pay", () => {
  const cart = { items: [{ productId, qty: 2, unitPrice: 500, discount: 0 }], discountTotal: 0 };

  it("holdCart creates a hold", async () => {
    const { holdId } = await holdCart(prisma, tenant(), {
      warehouseId,
      items: cart.items,
      discountTotal: 0,
      label: "Table 3",
    });
    expect(holdId).toBeTruthy();

    const holds = await listHolds(prisma, tenant());
    expect(holds.length).toBe(1);
    expect(holds[0].holdId).toBe(holdId);
    expect(holds[0].label).toBe("Table 3");
  });

  it("resumeCart returns cart and deletes hold", async () => {
    const { holdId } = await holdCart(prisma, tenant(), {
      warehouseId,
      items: [{ productId, qty: 1, unitPrice: 500, discount: 0 }],
      discountTotal: 0,
    });

    const resumed = await resumeCart(prisma, tenant(), holdId);
    expect(resumed.warehouseId).toBe(warehouseId);
    expect(resumed.cart.items).toHaveLength(1);
    expect(resumed.cart.items[0].productId).toBe(productId);

    const holds = await listHolds(prisma, tenant());
    expect(holds.find((h) => h.holdId === holdId)).toBeUndefined();
  });

  it("resumeCart throws on invalid hold", async () => {
    await expect(resumeCart(prisma, tenant(), "nonexistent")).rejects.toThrow("Hold not found");
  });

  it("deleteHold removes hold without paying", async () => {
    const { holdId } = await holdCart(prisma, tenant(), {
      warehouseId,
      items: cart.items,
      discountTotal: 0,
    });

    const result = await deleteHold(prisma, tenant(), holdId);
    expect(result.deleted).toBe(true);

    const holds = await listHolds(prisma, tenant());
    expect(holds.find((h) => h.holdId === holdId)).toBeUndefined();
  });

  it("payFromHold creates identical sale to direct createSale", async () => {
    const { holdId } = await holdCart(prisma, tenant(), {
      warehouseId,
      customerId,
      items: [{ productId, qty: 1, unitPrice: 500, discount: 0 }],
      discountTotal: 0,
    });

    const result = await payFromHold(prisma, tenant(), holdId, 500, cashAccountId);
    expect(result.invoiceId).toBeTruthy();
    expect(result.total).toBe(575n); // 500 + 75 tax (15% bps)
    expect(result.creditPortion).toBe(75n);

    // Hold should be deleted after pay
    const holds = await listHolds(prisma, tenant());
    expect(holds.find((h) => h.holdId === holdId)).toBeUndefined();
  });

  it("hold survives multiple list calls (persistence)", async () => {
    const { holdId } = await holdCart(prisma, tenant(), {
      warehouseId,
      items: cart.items,
      discountTotal: 0,
      label: "Persistent Hold",
    });

    // Simulate "reload" — multiple reads
    const list1 = await listHolds(prisma, tenant());
    const list2 = await listHolds(prisma, tenant());
    expect(list1.find((h) => h.holdId === holdId)).toBeTruthy();
    expect(list2.find((h) => h.holdId === holdId)).toBeTruthy();
  });

  it("multiple holds can coexist", async () => {
    const { holdId: h1 } = await holdCart(prisma, tenant(), {
      warehouseId,
      items: [{ productId, qty: 1, unitPrice: 500, discount: 0 }],
      discountTotal: 0,
      label: "Hold A",
    });
    const { holdId: h2 } = await holdCart(prisma, tenant(), {
      warehouseId,
      items: [{ productId, qty: 3, unitPrice: 500, discount: 0 }],
      discountTotal: 0,
      label: "Hold B",
    });

    const holds = await listHolds(prisma, tenant());
    expect(holds.length).toBeGreaterThanOrEqual(2);

    // Clean up
    await deleteHold(prisma, tenant(), h1);
    await deleteHold(prisma, tenant(), h2);
  });
});

describe("M8 — Receipt generation", () => {
  const branding: ReceiptBranding = {
    orgNameAr: "سوبر ماركت",
    orgNameEn: "Super Market",
    primaryColor: "#1e40af",
    secondaryColor: "#3b82f6",
    accentColor: "#2563eb",
  };

  const receiptData: ReceiptData = {
    number: "INV-00001",
    issuedAt: "2026-08-25T18:00:00.000Z",
    items: [
      { name: "Tea", qty: 2, unitPrice: 500, discount: 0, lineTotal: 1000 },
      { name: "Coffee", qty: 1, unitPrice: 1200, discount: 100, lineTotal: 1100 },
    ],
    subtotal: 2100,
    discountTotal: 100,
    taxTotal: 300,
    total: 2400,
    cashPaid: 2000,
    creditPortion: 400,
    customerName: "Ahmad",
    cashierName: "Sara",
  };

  it("58mm receipt has correct width", () => {
    const tpl = generateReceipt(receiptData, branding, "58mm", false);
    expect(tpl.widthPx).toBe(384);
    expect(tpl.html).toContain("INV-00001");
    expect(tpl.html).toContain("Super Market");
  });

  it("80mm receipt has correct width", () => {
    const tpl = generateReceipt(receiptData, branding, "80mm", false);
    expect(tpl.widthPx).toBe(576);
  });

  it("a4 receipt has correct width", () => {
    const tpl = generateReceipt(receiptData, branding, "a4", false);
    expect(tpl.widthPx).toBe(794);
  });

  it("RTL receipt uses Arabic org name", () => {
    const tpl = generateReceipt(receiptData, branding, "80mm", true);
    expect(tpl.html).toContain("سوبر ماركت");
    expect(tpl.html).toContain('dir="rtl"');
  });

  it("LTR receipt uses English org name", () => {
    const tpl = generateReceipt(receiptData, branding, "80mm", false);
    expect(tpl.html).toContain("Super Market");
    expect(tpl.html).toContain('dir="ltr"');
  });

  it("receipt shows discount when present", () => {
    const tpl = generateReceipt(receiptData, branding, "80mm", false);
    expect(tpl.html).toContain("Discount");
    expect(tpl.html).toContain("-100.00");
  });

  it("receipt hides discount when zero", () => {
    const data = { ...receiptData, discountTotal: 0 };
    const tpl = generateReceipt(data, branding, "80mm", false);
    expect(tpl.html).not.toContain("Discount");
  });

  it("receipt shows credit portion", () => {
    const tpl = generateReceipt(receiptData, branding, "80mm", false);
    expect(tpl.html).toContain("Credit");
    expect(tpl.html).toContain("400.00");
  });

  it("receipt shows all line items", () => {
    const tpl = generateReceipt(receiptData, branding, "80mm", false);
    expect(tpl.html).toContain("Tea");
    expect(tpl.html).toContain("Coffee");
    expect(tpl.html).toContain("2,400.00"); // total
  });
});

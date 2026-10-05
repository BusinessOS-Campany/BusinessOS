/**
 * Seeds a realistic volume of tenant data into the perf-probe org so the
 * aggregation / pagination hot paths are measured against real row counts
 * instead of an empty schema.
 *
 * Usage: npx tsx scripts/perf-seed.ts [email] [scale]
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

for (const file of [".env.local", ".env"]) {
  try {
    for (const raw of readFileSync(join(process.cwd(), file), "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 1) continue;
      const key = line.slice(0, eq).trim();
      if (process.env[key] === undefined) process.env[key] = line.slice(eq + 1).trim();
    }
  } catch {
    /* optional */
  }
}

const email = process.argv[2] ?? "perfowner@bos.local";
const SCALE = Number(process.argv[3] ?? 1);

const PRODUCTS = 2000 * SCALE;
const CUSTOMERS = 800 * SCALE;
const SUPPLIERS = 60 * SCALE;
const INVOICES = 1500 * SCALE;
const WAREHOUSES = 3;
const ITEMS_PER_INVOICE = 4;

const chunk = <T,>(arr: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

async function main() {
  const { sharedPrisma } = await import("../src/core/db/client");
  const { tenantSchemaName } = await import("../src/core/tenancy/schemas");

  const user = await sharedPrisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) throw new Error(`no user ${email}`);
  const member = await sharedPrisma.member.findFirst({
    where: { userId: user.id },
    select: { organizationId: true },
  });
  if (!member) throw new Error("user has no membership");
  const orgId = member.organizationId;

  const org = await sharedPrisma.organization.findUnique({
    where: { id: orgId },
    select: { slug: true, schemaName: true },
  });
  if (!org) throw new Error("no org");
  const schema = org.schemaName ?? tenantSchemaName(org.slug);

  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { Pool } = await import("pg");
  const { PrismaClient } = await import("../src/core/db/generated/prisma/client");
  const connectionString = (process.env.DATABASE_URL ?? "").replace(/\?schema=[^&]*$/, "");
  const pool = new Pool({ connectionString, options: `-c search_path=${schema}`, max: 4 });
  const tp = new PrismaClient({ adapter: new PrismaPg(pool, { schema }) });

  await sharedPrisma.organization.update({
    where: { id: orgId },
    data: {
      settings: {
        modulesEnabled: [
          "pos", "sales", "products", "inventory", "customers", "suppliers",
          "purchases", "expenses", "finance", "reports", "workflows", "audit",
          "settings", "users",
        ],
        branding: { primary: "#03EABC" },
      } as never,
    },
  });

  const already = await tp.product.count({ where: { organizationId: orgId } });
  if (already > 0 && !process.env.PERF_SEED_RESET) {
    console.log(`already seeded: ${already} products`);
    await tp.$disconnect();
    return;
  }
  if (already > 0) {
    // Reset: an earlier partial run left rows behind, and every insert below is
    // only correct on an empty schema.
    console.log("resetting previous seed...");
    const resetArgs = { where: { organizationId: orgId } } as never;
    // The array mixes several delegates, so each element's deleteMany has a
    // different payload type; narrow the element type so the call compiles.
    for (const m of [
      tp.cashMovement,
      tp.salesInvoiceItem,
      tp.salesInvoice,
      tp.cashAccount,
      tp.stockLevel,
      tp.customer,
      tp.supplier,
      tp.product,
      tp.warehouse,
      tp.category,
      tp.unit,
    ] as Array<{ deleteMany: (args: never) => Promise<unknown> }>) {
      await m.deleteMany(resetArgs);
    }
  }

  const now = Date.now();
  const t0 = performance.now();

  const warehouseRows = Array.from({ length: WAREHOUSES }, (_, i) => ({
    id: randomUUID(),
    organizationId: orgId,
    nameAr: `مستودع ${i + 1}`,
    nameEn: `Warehouse ${i + 1}`,
    isMain: i === 0,
    createdAt: new Date(),
  }));
  await tp.warehouse.createMany({ data: warehouseRows });

  const unitId = randomUUID();
  await tp.unit.create({
    data: {
      id: unitId,
      organizationId: orgId,
      nameAr: "قطعة",
      nameEn: "Piece",
      factor: 1,
      isBase: true,
      createdAt: new Date(),
    },
  });

  const catId = randomUUID();
  await tp.category.create({
    data: { id: catId, organizationId: orgId, nameAr: "عام", nameEn: "General", isActive: true, createdAt: new Date() },
  });

  const productRows = Array.from({ length: PRODUCTS }, (_, i) => ({
    id: randomUUID(),
    organizationId: orgId,
    categoryId: catId,
    baseUnitId: unitId,
    sku: `SKU-${String(i + 1).padStart(6, "0")}`,
    barcode: `BC${String(i + 1).padStart(9, "0")}`,
    nameAr: `منتج تجريبي ${i + 1}`,
    nameEn: `Test Product ${i + 1}`,
    costPrice: BigInt(1000 + (i % 400) * 7),
    salePrice: BigInt(1500 + (i % 400) * 9),
    minStock: i % 25 === 0 ? 10 : 0,
    trackStock: true,
    isActive: true,
    createdAt: new Date(),
  }));
  for (const b of chunk(productRows, 500)) await tp.product.createMany({ data: b });

  const supplierRows = Array.from({ length: SUPPLIERS }, (_, i) => ({
    id: randomUUID(),
    organizationId: orgId,
    name: `مورد ${i + 1}`,
    balance: BigInt(0),
    isActive: true,
    createdAt: new Date(),
  }));
  for (const b of chunk(supplierRows, 500)) await tp.supplier.createMany({ data: b });

  const customerRows = Array.from({ length: CUSTOMERS }, (_, i) => ({
    id: randomUUID(),
    organizationId: orgId,
    name: `عميل ${i + 1}`,
    balance: BigInt(i % 7 === 0 ? (i + 1) * 137 : 0),
    creditLimit: BigInt(0),
    isActive: true,
    createdAt: new Date(),
  }));
  for (const b of chunk(customerRows, 500)) await tp.customer.createMany({ data: b });

  // stock_levels is unique on (productId, warehouseId), so the warehouse is
  // assigned by position rather than at random.
  const stockRows = productRows.flatMap((p) =>
    warehouseRows.map((w) => ({
      id: randomUUID(),
      organizationId: orgId,
      warehouseId: w.id,
      productId: p.id,
      qty: Math.round(Math.random() * 500 * 1000) / 1000,
    })),
  );
  for (const b of chunk(stockRows, 1000)) await tp.stockLevel.createMany({ data: b });

  const cashAccount = await tp.cashAccount.create({
    data: {
      id: randomUUID(),
      organizationId: orgId,
      nameAr: "الصندوق",
      nameEn: "Cash",
      type: "cash",
      openingBalance: BigInt(0),
      isActive: true,
      createdAt: new Date(),
    },
  });

  const invoices = Array.from({ length: INVOICES }, (_, n) => {
    const at = new Date(now - Math.random() * 300 * 86400000);
    return {
      id: randomUUID(),
      seq: n,
      organizationId: orgId,
      customerId: customerRows[Math.floor(Math.random() * customerRows.length)].id,
      warehouseId: warehouseRows[0].id,
      at,
    };
  });

  for (const b of chunk(invoices, 250)) {
    await tp.salesInvoice.createMany({
      data: b.map((inv) => ({
        id: inv.id,
        organizationId: orgId,
        number: `INV-${String(inv.seq + 1).padStart(8, "0")}`,
        customerId: inv.customerId,
        warehouseId: inv.warehouseId,
        status: "posted",
        subtotal: BigInt(5000),
        discountTotal: BigInt(0),
        taxTotal: BigInt(0),
        total: BigInt(5000),
        paidTotal: BigInt(5000),
        issuedAt: inv.at,
        createdAt: inv.at,
      })),
    });
  }

  const itemRows = invoices.flatMap((inv) =>
    Array.from({ length: ITEMS_PER_INVOICE }, () => {
      const p = productRows[Math.floor(Math.random() * productRows.length)];
      return {
        id: randomUUID(),
        organizationId: orgId,
        invoiceId: inv.id,
        productId: p.id,
        qty: Math.round((1 + Math.random() * 4) * 1000) / 1000,
        unitPrice: p.salePrice,
        discount: BigInt(0),
        taxRateBps: 0,
        lineSubtotal: BigInt(5000),
        lineTax: BigInt(0),
        lineTotal: BigInt(5000),
        unitCost: p.costPrice,
      };
    }),
  );
  for (const b of chunk(itemRows, 1000)) await tp.salesInvoiceItem.createMany({ data: b });

  const cashRows = invoices.flatMap((inv, i) => [
    {
      id: randomUUID(),
      organizationId: orgId,
      accountId: cashAccount.id,
      delta: BigInt(5000),
      reason: "sale",
      refType: "sales_invoice",
      refId: inv.id,
      createdAt: inv.at,
    },
    {
      id: randomUUID(),
      organizationId: orgId,
      accountId: cashAccount.id,
      delta: BigInt(-1000),
      reason: i % 3 === 0 ? "expense" : "purchase",
      refType: "purchase",
      refId: inv.id,
      createdAt: inv.at,
    },
  ]);
  for (const b of chunk(cashRows, 1000)) await tp.cashMovement.createMany({ data: b });

  const counts = {
    products: await tp.product.count({ where: { organizationId: orgId } }),
    customers: await tp.customer.count({ where: { organizationId: orgId } }),
    stockLevels: await tp.stockLevel.count({ where: { organizationId: orgId } }),
    invoices: await tp.salesInvoice.count({ where: { organizationId: orgId } }),
    invoiceItems: await tp.salesInvoiceItem.count({ where: { organizationId: orgId } }),
    cashMovements: await tp.cashMovement.count({ where: { organizationId: orgId } }),
  };
  console.log(`seeded in ${((performance.now() - t0) / 1000).toFixed(1)}s`, counts);
  await tp.$disconnect();
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);

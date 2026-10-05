/**
 * Verifies the SQL report aggregations against the previous JavaScript
 * implementation, on real seeded data. The reports are the app's financial
 * figures, so "faster" is worthless if the totals moved.
 *
 * Usage: npx tsx scripts/verify-reports.ts
 */
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

async function main() {
  const { sharedPrisma, prisma } = await import("../src/core/db/client");
  const { ReportsService } = await import("../src/core/reports/service");
  const { runWithTenantContext } = await import("../src/core/tenancy/context-store");
  const { tenantSchemaName, getTenantPrisma } = await import(
    "../src/core/tenancy/schemas"
  );

  const ORG_SLUG = process.env.PERF_ORG ?? "perfprobe-Z9JP7IC2";

  const org = await sharedPrisma.organization.findFirst({
    where: { slug: ORG_SLUG },
    select: { id: true, slug: true, schemaName: true },
  });
  if (!org) throw new Error(`org ${ORG_SLUG} not found — run scripts/perf-seed.ts first`);

  // The tenant's business tables live in its own schema, and `prisma` only
  // routes there under an active tenant context. Reproduce what `withRoute`
  // does so both the old and new code paths read the same real data.
  const schemaName = org.schemaName ?? tenantSchemaName(org.slug);
  const runtime = {
    organizationId: org.id,
    slug: org.slug,
    schemaName,
    databaseName: null,
    prisma: getTenantPrisma(schemaName),
  };

  await runWithTenantContext(runtime, () => verify(org.id, schemaName));
  process.exit(failures === 0 ? 0 : 1);
}

let failures = 0;

async function verify(orgId: string, schemaName: string) {
  const { prisma } = await import("../src/core/db/client");
  const { ReportsService } = await import("../src/core/reports/service");
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  const svc = new ReportsService(prisma);
  console.log(`verifying org ${orgId} in schema ${schemaName}\n`);

  const check = (label: string, a: bigint | string, b: bigint | string) => {
    const ok = String(a) === String(b);
    if (!ok) failures++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}: sql=${a} legacy=${b}`);
  };

  // ---- grossProfit: new SQL vs the old findMany + JS sum ----
  const newProfit = await svc.grossProfit(orgId, from, to);
  const invoices = await prisma.salesInvoice.findMany({
    where: { organizationId: orgId, status: "posted", issuedAt: { gte: from, lte: to } },
    select: { id: true },
  });
  const ids = invoices.map((i) => i.id);
  let legacyRevenue = 0n;
  let legacyCost = 0n;
  if (ids.length) {
    const items = await prisma.salesInvoiceItem.findMany({
      where: { organizationId: orgId, invoiceId: { in: ids } },
      select: { lineSubtotal: true, qty: true, unitCost: true },
    });
    for (const it of items) {
      legacyRevenue += it.lineSubtotal;
      const milli = BigInt(it.qty.toFixed(3).replace(".", ""));
      legacyCost += (it.unitCost * milli) / 1000n;
    }
  }
  check("grossProfit.revenue", newProfit.revenue, legacyRevenue);
  check("grossProfit.cost", newProfit.cost, legacyCost);
  check("grossProfit.profit", newProfit.profit, legacyRevenue - legacyCost);

  // ---- inventoryValuation ----
  const newInv = await svc.inventoryValuation(orgId);
  const levels = await prisma.stockLevel.findMany({
    where: { organizationId: orgId },
    select: { productId: true, qty: true },
  });
  const products = await prisma.product.findMany({
    where: { organizationId: orgId, id: { in: [...new Set(levels.map((l) => l.productId))] } },
    select: { id: true, costPrice: true, salePrice: true, minStock: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  let legacyCostValue = 0n;
  let legacyRetailValue = 0n;
  const qtyPerProduct = new Map<string, number>();
  for (const lvl of levels) {
    const p = byId.get(lvl.productId);
    if (!p) continue;
    const milli = BigInt(lvl.qty.toFixed(3).replace(".", ""));
    legacyCostValue += (p.costPrice * milli) / 1000n;
    legacyRetailValue += (p.salePrice * milli) / 1000n;
    qtyPerProduct.set(lvl.productId, (qtyPerProduct.get(lvl.productId) ?? 0) + Number(lvl.qty));
  }
  let legacyLowCount = 0;
  for (const p of products) {
    const min = p.minStock ? Number(p.minStock) : null;
    if (min !== null && (qtyPerProduct.get(p.id) ?? 0) <= min) legacyLowCount++;
  }
  check("inventory.costValue", newInv.costValue, legacyCostValue);
  check("inventory.retailValue", newInv.retailValue, legacyRetailValue);
  check("inventory.lowStockTotal", BigInt(newInv.lowStockTotal), BigInt(legacyLowCount));

  // ---- debtReport ----
  const newDebt = await svc.debtReport(orgId);
  const debtors = await prisma.customer.findMany({
    where: { organizationId: orgId, balance: { not: 0 } },
    select: { balance: true },
  });
  const legacyTotal = debtors.reduce((a, c) => a + c.balance, 0n);
  check("debt.totalReceivable", newDebt.totalReceivable, legacyTotal);
  check("debt.customerCount", BigInt(newDebt.customerCount), BigInt(debtors.length));

  // ---- cashflow balances ----
  const newCash = await svc.cashflow(orgId, from, to);
  const accounts = await prisma.cashAccount.findMany({
    where: { organizationId: orgId },
    select: { id: true, openingBalance: true },
  });
  const legacyBalances = new Map(accounts.map((a) => [a.id, a.openingBalance]));
  const allMoves = await prisma.cashMovement.findMany({
    where: { organizationId: orgId, createdAt: { lte: to } },
    select: { accountId: true, delta: true },
  });
  for (const m of allMoves) {
    legacyBalances.set(m.accountId, (legacyBalances.get(m.accountId) ?? 0n) + m.delta);
  }
  for (const [accId, expected] of legacyBalances) {
    const got = (newCash.balances as Record<string, bigint>)[accId] ?? 0n;
    if (String(got) !== String(expected)) {
      failures++;
      console.log(`FAIL  cashflow.balances[${accId}]: sql=${got} legacy=${expected}`);
    }
  }
  console.log(`PASS  cashflow.balances: ${legacyBalances.size} account(s) matched`);
  console.log(
    `\nrows compared: ${ids.length} invoices, ${levels.length} stock levels, ${allMoves.length} cash movements`,
  );
  console.log(failures === 0 ? "ALL REPORT FIGURES RECONCILE" : `${failures} MISMATCH(ES)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

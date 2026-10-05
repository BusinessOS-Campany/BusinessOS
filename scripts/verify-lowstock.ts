/**
 * Focused check of the low-stock SQL: temporarily raises `min_stock` on a
 * known set of products so the branch is actually exercised, compares the SQL
 * result against the legacy JS rule, then restores the original values.
 *
 * Usage: npx tsx scripts/verify-lowstock.ts
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
  const { sharedPrisma } = await import("../src/core/db/client");
  const { runWithTenantContext } = await import("../src/core/tenancy/context-store");
  const { tenantSchemaName, getTenantPrisma } = await import("../src/core/tenancy/schemas");
  const { prisma } = await import("../src/core/db/client");
  const { ReportsService } = await import("../src/core/reports/service");

  const org = await sharedPrisma.organization.findFirst({
    where: { slug: process.env.PERF_ORG ?? "perfprobe-Z9JP7IC2" },
    select: { id: true, slug: true, schemaName: true },
  });
  if (!org) throw new Error("probe org not found");

  const schemaName = org.schemaName ?? tenantSchemaName(org.slug);
  await runWithTenantContext(
    {
      organizationId: org.id,
      slug: org.slug,
      schemaName,
      databaseName: null,
      prisma: getTenantPrisma(schemaName),
    },
    () => check(org.id),
  );
}

async function check(orgId: string) {
  const { prisma } = await import("../src/core/db/client");
  const { ReportsService } = await import("../src/core/reports/service");

  // Save current min_stock, then force a known low-stock population.
  const products = await prisma.product.findMany({
    where: { organizationId: orgId, minStock: { not: null } },
    select: { id: true, minStock: true },
    orderBy: { id: "asc" },
    take: 40,
  });
  if (!products.length) {
    console.log("no products with minStock set — nothing to verify");
    return;
  }
  const original = new Map(products.map((p) => [p.id, p.minStock!]));

  try {
    // Every one of these products is now above its own stock level, so the
    // rule "sum(qty) <= min_stock" must select all of them.
    for (const p of products) {
      await prisma.product.update({
        where: { id: p.id },
        data: { minStock: "999999" },
      });
    }

    const svc = new ReportsService(prisma);
    const res = await svc.inventoryValuation(orgId);

    // Legacy rule, recomputed independently.
    const levels = await prisma.stockLevel.findMany({
      where: { organizationId: orgId },
      select: { productId: true, qty: true },
    });
    const ids = new Set(products.map((p) => p.id));
    const qtyPer = new Map<string, number>();
    for (const l of levels) {
      if (!ids.has(l.productId)) continue;
      qtyPer.set(l.productId, (qtyPer.get(l.productId) ?? 0) + Number(l.qty));
    }
    const expected = products.filter((p) => (qtyPer.get(p.id) ?? 0) <= 999999).length;

    const ok = res.lowStockTotal === expected;
    console.log(
      `${ok ? "PASS" : "FAIL"}  lowStockTotal: sql=${res.lowStockTotal} legacy=${expected} (list returned ${res.lowStock.length} row(s), capped at 100)`,
    );
    if (!ok) process.exitCode = 1;
  } finally {
    for (const p of products) {
      await prisma.product.update({
        where: { id: p.id },
        data: { minStock: original.get(p.id)!.toString() },
      });
    }
    console.log(`restored ${original.size} product min_stock values`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Prints the query plan for the new report aggregations so index coverage can
 * be judged from the planner rather than guessed at.
 *
 * Usage: npx tsx scripts/verify-plans.ts
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
    () => run(org.id),
  );
}

const QUERIES: Array<[string, string, number]> = [
  [
    "grossProfit",
    `EXPLAIN (ANALYZE, BUFFERS)
     SELECT COALESCE(SUM(sii.line_subtotal), 0)::bigint,
            COALESCE(SUM(TRUNC(sii.unit_cost * sii.qty)), 0)::bigint
     FROM sales_invoice_items sii
     JOIN sales_invoices si ON si.id = sii.invoice_id
     WHERE sii.organization_id = $1 AND si.organization_id = $1
       AND si.status = 'posted' AND si.issued_at >= $2 AND si.issued_at <= $3`,
    3,
  ],
  [
    "inventoryValuation",
    `EXPLAIN (ANALYZE, BUFFERS)
     SELECT COALESCE(SUM(TRUNC(p.cost_price * sl.qty)), 0)::bigint,
            COALESCE(SUM(TRUNC(p.sale_price * sl.qty)), 0)::bigint
     FROM stock_levels sl
     JOIN products p ON p.id = sl.product_id
     WHERE sl.organization_id = $1 AND p.organization_id = $1`,
    1,
  ],
  [
    "cashflowByReason",
    `EXPLAIN (ANALYZE, BUFFERS)
     SELECT reason, SUM(delta) FROM cash_movements
     WHERE organization_id = $1 AND created_at >= $2 AND created_at <= $3
     GROUP BY reason`,
    3,
  ],
  [
    "cashflowBalances",
    `EXPLAIN (ANALYZE, BUFFERS)
     SELECT account_id, SUM(delta) FROM cash_movements
     WHERE organization_id = $1 AND created_at <= $2
     GROUP BY account_id`,
    2,
  ],
];

async function run(orgId: string) {
  const { prisma } = await import("../src/core/db/client");
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

  for (const [name, sql, arity] of QUERIES) {
    const all = [orgId, from, to];
    const rows = (await prisma.$queryRawUnsafe(sql, ...all.slice(0, arity))) as Array<
      Record<string, string>
    >;
    console.log(`\n=== ${name} ===`);
    for (const r of rows) {
      const line = r["QUERY PLAN"];
      if (
        /\b(Seq Scan|Index Scan|Index Only Scan|Bitmap|Sort|Aggregate|GroupAggregate|HashAggregate|Nested Loop|Hash Join|Time:|Buffers:)/.test(
          line,
        )
      ) {
        console.log("  " + line.trim());
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

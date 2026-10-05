/**
 * Perf-probe helper: makes sure the probe org's isolated tenant schema exists.
 * `perf-probe-login.ts` deliberately skips provisioning, and `perf-seed.ts`
 * assumes the schema is already there, so this is the missing middle step
 * after a database reset.
 *
 * Usage: npx tsx scripts/perf-probe-provision.ts [orgSlug]
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

const slug = process.argv[2] ?? process.env.PERF_ORG;

async function main() {
  const { sharedPrisma } = await import("../src/core/db/client");
  const { provisionTenantSchema, getTenantPrisma } = await import("../src/core/tenancy/schemas");

  const orgs = slug
    ? await sharedPrisma.organization.findMany({ where: { slug }, select: { id: true, slug: true } })
    : await sharedPrisma.organization.findMany({
        where: { slug: { startsWith: "perfprobe-" } },
        select: { id: true, slug: true },
      });

  if (!orgs.length) {
    throw new Error(
      `no probe org found${slug ? ` for slug ${slug}` : ""} — run scripts/perf-probe-login.ts first`,
    );
  }

  for (const org of orgs) {
    const schemaName = await provisionTenantSchema(org);
    console.log(`provisioned ${org.slug} -> ${schemaName}`);

    const tp = getTenantPrisma(schemaName);
    const counts = await Promise.all([
      tp.product.count(),
      tp.customer.count(),
      tp.salesInvoice.count(),
      tp.stockLevel.count(),
      tp.cashMovement.count(),
    ]);
    console.log(
      `  rows: product=${counts[0]} customer=${counts[1]} invoice=${counts[2]} stockLevel=${counts[3]} cashMovement=${counts[4]}`,
    );
    await tp.$disconnect();
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);

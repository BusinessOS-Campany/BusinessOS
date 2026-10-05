/**
 * Diagnostic: report which schema holds what for the probe identity/org, so a
 * "user not found" sign-in failure can be traced to a specific schema.
 *
 * Usage: npx tsx scripts/inspect-identity.ts
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
  const { sharedPrisma, dbSchema } = await import("../src/core/db/client");
  const { Pool } = await import("pg");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient } = await import("../src/core/db/generated/prisma/client");

  console.log(`shared schema: ${dbSchema}`);

  const users = await sharedPrisma.user.findMany({
    select: { id: true, email: true, name: true },
    orderBy: { email: "asc" },
  });
  console.log(`\nusers in shared schema (${users.length}):`);
  for (const u of users) console.log(`  ${u.email}  ${u.id}`);

  const orgs = await sharedPrisma.organization.findMany({
    select: { id: true, slug: true, name: true, schemaName: true },
    orderBy: { slug: "asc" },
  });
  console.log(`\norganizations in shared schema (${orgs.length}):`);
  for (const o of orgs) console.log(`  ${o.slug}  schema=${o.schemaName ?? "(none)"}  ${o.name}`);

  const members = await sharedPrisma.member.findMany({
    select: { organizationId: true, userId: true, role: true },
  });
  console.log(`\nmembers in shared schema (${members.length}):`);
  for (const m of members) console.log(`  org=${m.organizationId} user=${m.userId} role=${m.role}`);

  // Now look inside each tenant schema for a stray copy of the user/org.
  const pool = new Pool({
    connectionString: (process.env.DATABASE_URL ?? "").replace(/\?schema=[^&]*$/, ""),
    max: 4,
  });
  try {
    const sch = await pool.query<{ schema_name: string }>(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 't\\_%' ORDER BY schema_name`,
    );
    console.log(`\ntenant schemas (${sch.rows.length}):`);
    for (const s of sch.rows) {
      // Tenant schemas are per-tenant copies of the business models, so the
      // identity tables (user/organization/member) are not expected to exist
      // there at all. Count the business tables instead.
      const info = await pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM information_schema.tables
         WHERE table_schema = $1 AND table_name IN ('product','customer','sales_invoice','stock_level','cash_movement')`,
        [s.schema_name],
      );
      const businessTables = info.rows[0]?.n ?? 0;

      let rowCounts = "";
      if (businessTables > 0) {
        for (const t of ["product", "customer", "sales_invoice", "stock_level", "cash_movement"]) {
          try {
            const r = await pool.query<{ n: number }>(
              `SELECT count(*)::int AS n FROM "${s.schema_name}"."${t}"`,
            );
            rowCounts += ` ${t}=${r.rows[0]?.n}`;
          } catch {
            rowCounts += ` ${t}=n/a`;
          }
        }
      }
      console.log(`  ${s.schema_name}: businessTables=${businessTables}${rowCounts}`);
    }
  } finally {
    await pool.end();
  }
  void PrismaPg;
  void PrismaClient;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

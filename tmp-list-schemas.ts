import { Pool } from "pg";
import "./src/core/config/load-env";

async function main() {
  const base = (process.env.DATABASE_URL ?? "").replace(/\?.*$/, "");
  const url = process.env.DEMO_DATABASE_URL ?? base.replace(/\/[^/]*$/, "/demo");
  const pool = new Pool({ connectionString: url });
  const r = await pool.query(
    "SELECT nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname != 'information_schema' ORDER BY nspname",
  );
  console.log("database:", new URL(url).pathname);
  console.log("schemas:", r.rows.map((x) => x.nspname).join(", "));
  const t = await pool.query(
    "SELECT table_schema, count(*)::text AS n FROM information_schema.tables GROUP BY table_schema ORDER BY table_schema",
  );
  for (const row of t.rows) console.log(`  ${row.table_schema}: ${row.n} tables`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

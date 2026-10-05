import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "@/core/config/load-env";
import { Pool } from "pg";
import { DEMO_SYSTEMS } from "@/core/demo/demo-systems";
import { TENANT_TABLES } from "@/core/tenancy/schemas";
import { dbSchema } from "@/core/db/client";

/**
 * Provisions one isolated PostgreSQL schema per demo system (`demo_<slug>`),
 * each holding empty structural copies of every tenant-owned business table
 * (same LIKE INCLUDING ALL pattern as provisionTenantSchema). Fully idempotent
 * — safe to re-run.
 *
 * Demo data lives in its OWN database (`demo`), separate from the platform
 * database. Target resolution, in order:
 *   1. DEMO_DATABASE_URL
 *   2. DATABASE_URL with the database segment swapped for `demo`
 * The platform database (DATABASE_URL) is only the structural source: PostgreSQL
 * cannot `LIKE` a table in another database, so the shared schema is streamed
 * in with `pg_dump --schema-only` when the demo database does not have it yet,
 * then dropped again — the demo database must end up holding demo schemas only.
 *
 * Run: npx tsx scripts/provision-demo-schemas.ts
 *
 * Verifiable goal: 9 demo_* schemas in the demo database, each containing all
 * TENANT_TABLES, and no leftover platform schema.
 */

const DEMO_DATABASE = "demo";

function sanitizeSlug(slug: string): string {
  return slug.toLowerCase().replace(/[^a-z0-9_]/g, "_");
}

export function demoSchemaName(slug: string): string {
  return `demo_${sanitizeSlug(slug)}`;
}

function isDemoSchemaName(value: string): boolean {
  return /^demo_[a-z0-9_]{1,58}$/.test(value);
}

function basePgUrl(): string {
  const url = (process.env.DATABASE_URL ?? "").replace(/\?schema=[^&]*$/, "");
  if (!url) throw new Error("[provision-demo-schemas] DATABASE_URL is not set");
  return url;
}

/** Swaps the database segment of a Postgres URL without re-encoding credentials. */
function withDatabase(url: string, database: string): string {
  if (!new RegExp(`\\/${database}(?:[?#]|$)`).test(url)) {
    const swapped = url.replace(/(\/\/[^/]*)(\/)[^?#]*/, `$1$2${database}`);
    if (swapped === url) throw new Error(`[provision-demo-schemas] cannot parse database from "${url}"`);
    return swapped;
  }
  return url;
}

function demoPgUrl(): string {
  const explicit = (process.env.DEMO_DATABASE_URL ?? "").trim();
  return explicit ? explicit.replace(/\?schema=[^&]*$/, "") : withDatabase(basePgUrl(), DEMO_DATABASE);
}

type SqlRunner = { host: string; port: string; user: string; password: string };

function runnerFrom(url: string): SqlRunner {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port || "5432",
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
  };
}

function databaseOf(url: string): string {
  return new URL(url).pathname.replace(/^\//, "");
}

/**
 * Streams the shared platform schema (DDL only) from the platform database into
 * the demo database so the `LIKE … INCLUDING ALL` template source exists there.
 * Returns true when a template had to be seeded.
 */
function seedTemplateSchema(platformDatabase: string, demoDatabase: string): boolean {
  const { host, port, user, password } = runnerFrom(basePgUrl());
  const dir = mkdtempSync(join(tmpdir(), "bos-demo-template-"));
  const dumpFile = join(dir, "template.sql");
  const env = { ...process.env, PGPASSWORD: password };
  try {
    execFileSync(
      "pg_dump",
      ["-h", host, "-p", port, "-U", user, "-d", platformDatabase, "-n", dbSchema, "--schema-only", "--no-owner", "--no-acl", "-f", dumpFile],
      { env, stdio: ["ignore", "ignore", "inherit"] },
    );
    execFileSync(
      "psql",
      ["-h", host, "-p", port, "-U", user, "-d", demoDatabase, "-v", "ON_ERROR_STOP=1", "-q", "-f", dumpFile],
      { env, stdio: ["ignore", "ignore", "inherit"] },
    );
    console.log(`[provision-demo-schemas] seeded template schema "${dbSchema}" into ${demoDatabase}`);
    return true;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  const demoUrl = demoPgUrl();
  const demoDatabase = databaseOf(demoUrl);
  const platformDatabase = databaseOf(basePgUrl());
  if (demoDatabase === platformDatabase) {
    throw new Error(
      `[provision-demo-schemas] refusing to provision demo schemas into the platform database "${platformDatabase}" — set DEMO_DATABASE_URL`,
    );
  }

  const pool = new Pool({ connectionString: demoUrl, max: 4 });
  let seededTemplate = false;
  try {
    const template = await pool.query<{ nspname: string }>(
      "SELECT nspname FROM pg_namespace WHERE nspname = $1",
      [dbSchema],
    );
    // The template schema is only needed when a demo schema still has to be
    // (re)built, so an up-to-date demo database never pays for the dump.
    const tablesPerSchema = await pool.query<{ table_schema: string; count: string }>(
      `SELECT table_schema, COUNT(*)::text AS count FROM information_schema.tables
       WHERE table_schema LIKE 'demo\\_%'
       GROUP BY table_schema`,
    );
    const complete = new Set(
      tablesPerSchema.rows.filter((r) => Number(r.count) === TENANT_TABLES.length).map((r) => r.table_schema),
    );
    const needsTemplate = DEMO_SYSTEMS.some((system) => !complete.has(demoSchemaName(system.slug)));
    if (needsTemplate && template.rowCount === 0) {
      seededTemplate = seedTemplateSchema(platformDatabase, demoDatabase);
    }

    for (const system of DEMO_SYSTEMS) {
      const schema = demoSchemaName(system.slug);
      if (!isDemoSchemaName(schema)) {
        throw new Error(`Refusing to provision invalid demo schema "${schema}"`);
      }
      await pool.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
      for (const table of TENANT_TABLES) {
        await pool.query(
          `CREATE TABLE IF NOT EXISTS "${schema}"."${table}" ` +
            `(LIKE "${dbSchema}"."${table}" INCLUDING ALL)`,
        );
      }
      console.log(`[provision-demo-schemas] ${demoDatabase}.${schema} ready (${TENANT_TABLES.length} tables)`);
    }

    if (seededTemplate) {
      await pool.query(`DROP SCHEMA IF EXISTS "${dbSchema}" CASCADE`);
      console.log(`[provision-demo-schemas] dropped template schema "${dbSchema}" from ${demoDatabase}`);
    }

    // Self-verification: every demo schema must hold the full table set, and the
    // demo database must not be left holding a platform-schema copy.
    const failures: string[] = [];
    for (const system of DEMO_SYSTEMS) {
      const schema = demoSchemaName(system.slug);
      const res = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM information_schema.tables WHERE table_schema = $1`,
        [schema],
      );
      const count = Number(res.rows[0]?.count ?? 0);
      console.log(`[provision-demo-schemas] verify ${demoDatabase}.${schema}: ${count}/${TENANT_TABLES.length} tables`);
      if (count !== TENANT_TABLES.length) failures.push(`${schema} (${count}/${TENANT_TABLES.length})`);
    }
    const leaked = await pool.query<{ nspname: string }>("SELECT nspname FROM pg_namespace WHERE nspname = $1", [
      dbSchema,
    ]);
    if (leaked.rowCount && leaked.rowCount > 0) failures.push(`leftover template schema "${dbSchema}"`);
    if (failures.length > 0) {
      throw new Error(`[provision-demo-schemas] incomplete provisioning: ${failures.join(", ")}`);
    }
    console.log(`[provision-demo-schemas] all demo schemas verified in database "${demoDatabase}"`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[provision-demo-schemas] failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});

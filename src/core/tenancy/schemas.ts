import { readdir, readFile } from "fs/promises";
import path from "path";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/core/db/generated/prisma/client";
import { sharedPrisma, dbSchema } from "@/core/db/client";

/**
 * Schema-per-org provisioning & connection factory.
 *
 * Every approved tenant is isolated in its own schema `t_<slug>` inside the one
 * shared PostgreSQL server. The schema holds the tenant-owned business tables
 * (products, invoices, POS, workflows, sama-*, …) as empty copies with the exact
 * same structure (columns, defaults, primary keys, indexes), while the shared
 * `businessos` schema keeps the platform registry (identity, orgs, membership,
 * apps, audits, plans).
 *
 * There is no per-tenant database. The `organization.databaseName` column is
 * left in place as NULL so older rows keep reading, and nothing sets it.
 */

/** Physical table names of every tenant-owned model (mirrors the database). */
export const TENANT_TABLES = [
  "ai_confirm_tokens", "ai_providers", "ai_usage_logs", "api_keys", "api_rate_limits",
  "audit_logs", "backup_records", "branches", "brands", "cash_accounts", "cash_movements",
  "categories", "conflict_queue", "custom_field_values", "custom_fields", "customer_groups",
  "customer_transactions", "customers", "dashboard_layouts", "data_exports",
  "expense_categories", "expenses", "idempotency_keys", "import_jobs",
  "loyalty_transactions", "notifications", "number_sequences", "outbox_events", "payments",
  "pos_holds", "product_barcodes", "product_batches", "products", "purchase_items",
  "purchase_order_items", "purchase_orders", "purchase_return_items", "purchase_returns",
  "purchases", "sales_invoice_items", "sales_invoices", "sales_return_items", "sales_returns",
  "saved_views", "stock_adjustments", "stock_levels", "stock_movements", "suppliers",
  "sync_devices", "units", "warehouses", "webhook_deliveries", "webhook_endpoints",
  "workflow_executions", "workflow_rules",
] as const;

/** Schema identifier we only ever emit for quoted identifiers we validate. */
function sq(ident: string): string {
  return `"${ident}"`;
}

function sanitizeIdent(value: string): string {
  return value.replace(/[^a-z0-9_]/g, "_");
}

/** Deterministic per-tenant schema name: `t_<slug>` (dashes become underscores). */
export function tenantSchemaName(slug: string): string {
  return `t_${sanitizeIdent(slug.toLowerCase())}`;
}

export function isTenantSchemaName(value: string): boolean {
  return /^t_[a-z0-9_]{1,63}$/.test(value);
}

/** Base connection URL (no schema param) of the shared platform database. */
function basePgUrl(): string {
  const url = (process.env.DATABASE_URL ?? "").replace(/\?schema=[^&]*$/, "");
  if (!url) throw new Error("[tenancy] DATABASE_URL is not set");
  return url;
}

// Raw pool used for DDL provisioning against the shared database (schema/table creation).
const adminPool = new Pool({
  connectionString: basePgUrl(),
  options: `-c search_path=${dbSchema}`,
  max: 4,
});

export function grocerySchemaName(slug: string): string {
  return `grocery_${sanitizeIdent(slug.toLowerCase())}`;
}

function isGrocerySchemaName(value: string): boolean {
  return /^grocery_[a-z0-9_]{1,53}$/.test(value);
}

/**
 * Applies the grocery app's own migrations to `grocery_<slug>`, in the shared
 * server next to the org's `t_<slug>` schema. Each migration runs in its own
 * transaction with a local `search_path`, recorded in `_bos_migrations`.
 */
export async function provisionGrocerySchema(schemaName: string): Promise<void> {
  if (!isGrocerySchemaName(schemaName)) {
    throw new Error("Refusing to provision an invalid grocery schema");
  }
  const migrationsDir = process.env.GROCERY_MIGRATIONS_DIR ??
    path.join(process.cwd(), "apps", "grocery", "prisma", "migrations");
  const entries = (await readdir(migrationsDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const client = await adminPool.connect();
  try {
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${sq(schemaName)}`);
    await client.query(
      `CREATE TABLE IF NOT EXISTS ${sq(schemaName)}."_bos_migrations" ("name" TEXT PRIMARY KEY, "applied_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    );
    const applied = await client.query<{ name: string }>(
      `SELECT "name" FROM ${sq(schemaName)}."_bos_migrations"`,
    );
    const appliedNames = new Set(applied.rows.map((row) => row.name));
    for (const entry of entries) {
      if (appliedNames.has(entry)) continue;
      const migration = await readFile(path.join(migrationsDir, entry, "migration.sql"), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(`SET LOCAL search_path TO ${sq(schemaName)}, public`);
        await client.query(migration);
        await client.query(
          `INSERT INTO ${sq(schemaName)}."_bos_migrations" ("name") VALUES ($1)`,
          [entry],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    client.release();
  }
}

/**
 * Creates the org's isolated schema and empty copies of every tenant-owned
 * table (structure only) in the shared server. Idempotent, and the schema is
 * the org's whole live data store. Records `schemaName` on the org.
 */
export async function provisionTenantSchema(org: { id: string; slug: string }): Promise<string> {
  const schemaName = tenantSchemaName(org.slug);
  if (!isTenantSchemaName(schemaName)) {
    throw new Error(`Refusing to provision invalid tenant schema "${schemaName}"`);
  }

  const client = await adminPool.connect();
  try {
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${sq(schemaName)}`);
    for (const table of TENANT_TABLES) {
      await client.query(
        `CREATE TABLE IF NOT EXISTS ${sq(schemaName)}.${sq(table)} ` +
          `(LIKE ${sq(dbSchema)}.${sq(table)} INCLUDING ALL)`,
      );
    }
  } catch (err) {
    throw new Error(
      `[tenancy] failed to provision schema ${schemaName}: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    client.release();
  }

  await sharedPrisma.organization.update({
    where: { id: org.id },
    data: { schemaName },
  });
  return schemaName;
}

/** Drops an org's schema (used when deleting a tenant). */
export async function revokeTenantSchema(schemaName: string): Promise<void> {
  if (!isTenantSchemaName(schemaName)) {
    throw new Error(`Refusing to drop schema "${schemaName}"`);
  }
  const client = await adminPool.connect();
  try {
    await client.query(`DROP SCHEMA IF EXISTS ${sq(schemaName)} CASCADE`);
  } finally {
    client.release();
  }
}

/**
 * Backfills the schema for orgs created before it existed, or after a restore.
 * Returns the schema names that were provisioned.
 */
export async function provisionTenantSchemasForAll(): Promise<{ schemaName: string }[]> {
  const orgs = await sharedPrisma.organization.findMany({
    where: { schemaName: null },
    select: { id: true, slug: true },
  });
  const provisioned: { schemaName: string }[] = [];
  for (const org of orgs) {
    provisioned.push({ schemaName: await provisionTenantSchema(org) });
  }
  return provisioned;
}

/**
 * Returns a Prisma client whose connections run against the shared server with
 * `search_path = <tenantSchema>` so unqualified queries hit the org's tables
 * first. Shared-registry reads are handled by the `prisma` proxy in
 * db/client.ts, which routes registry models to sharedPrisma. Cached per schema.
 */
const tenantClients = new Map<string, PrismaClient>();

export function getTenantPrisma(schemaName: string): PrismaClient {
  if (!isTenantSchemaName(schemaName)) {
    throw new Error(`Refusing tenant client for invalid schema "${schemaName}"`);
  }
  let client = tenantClients.get(schemaName);
  if (!client) {
    const pool = new Pool({
      connectionString: basePgUrl(),
      options: `-c search_path=${schemaName}`,
      max: 6,
    });
    client = new PrismaClient({ adapter: new PrismaPg(pool, { schema: schemaName }) });
    tenantClients.set(schemaName, client);
  }
  return client;
}

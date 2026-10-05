import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { Pool } from "pg";
import { TENANT_TABLES, isTenantSchemaName, tenantSchemaName } from "@/core/tenancy/schemas";
import { appendJsonLine, ensureOrgVaultDirs, orgVaultPaths } from "./paths";
import { pgBinDir as resolvePgBinDir } from "./pg-bin";
import { folderForSlug } from "./registry";

/**
 * The org's portable database: ONE plain-SQL file per organization.
 *
 * Every org is a schema (`t_<slug>`) inside the single shared PostgreSQL server —
 * there is no per-org server, port, or PGDATA. This module is the boundary
 * between that live schema and the org's folder:
 *
 *   export  pg_dump --schema=t_<slug>  ->  database/<folder>.sql   (sign-out)
 *   import  database/<folder>.sql      ->  t_<slug>                (open)
 *
 * The file is the artifact the customer owns. It is a `pg_dump` of exactly one
 * schema, so it restores with a plain `psql` on any PostgreSQL of the same
 * major version, with no dependency on this platform.
 */

const execFileAsync = promisify(execFile);

function basePgUrl(): string {
  const url = (process.env.DATABASE_URL ?? "").replace(/\?schema=[^&]*$/, "");
  if (!url) throw new Error("[org-sql] DATABASE_URL is not set");
  return url;
}

/** Admin pool on the shared server, used for DDL and existence checks. */
let adminPool: Pool | null = null;
function pool(): Pool {
  if (!adminPool) adminPool = new Pool({ connectionString: basePgUrl(), max: 4 });
  return adminPool;
}

export function closeOrgSqlPools(): Promise<void> {
  const p = adminPool;
  adminPool = null;
  return p ? p.end() : Promise.resolve();
}

function pgBinDir(): string {
  const dir = resolvePgBinDir();
  if (!dir) throw new Error("[org-sql] no PostgreSQL bin directory found (set PG_BIN_DIR)");
  return dir;
}

/** Quoted identifier for a name we have already validated. */
function sq(ident: string): string {
  return `"${ident}"`;
}

export interface OrgSqlInfo {
  slug: string;
  schemaName: string;
  filePath: string;
  fileName: string;
  /** False when the org has never been exported. */
  exists: boolean;
  bytes: number;
  sha256: string | null;
  /** ISO timestamp of the last successful export, from the sidecar. */
  exportedAt: string | null;
  /** True when `t_<slug>` currently exists in the shared server. */
  schemaPresent: boolean;
  tablesWithRows: { table: string; rows: number }[];
  rowsTotal: number;
}

function sidecarPath(filePath: string): string {
  return `${filePath}.meta.json`;
}

function assertSlug(slug: string): string {
  const schemaName = tenantSchemaName(slug);
  if (!isTenantSchemaName(schemaName)) {
    throw new Error(`[org-sql] refusing invalid tenant schema "${schemaName}"`);
  }
  return schemaName;
}

function pathsFor(slug: string) {
  return ensureOrgVaultDirs(orgVaultPaths(folderForSlug(slug)));
}

export async function schemaExists(slug: string): Promise<boolean> {
  const schemaName = assertSlug(slug);
  const res = await pool().query("SELECT 1 FROM pg_namespace WHERE nspname = $1", [schemaName]);
  return (res.rowCount ?? 0) > 0;
}

/** Row counts per tenant table that actually holds data. */
export async function schemaRowCounts(slug: string): Promise<{ table: string; rows: number }[]> {
  const schemaName = assertSlug(slug);
  const out: { table: string; rows: number }[] = [];
  for (const table of TENANT_TABLES) {
    const res = await pool().query(
      `SELECT count(*)::int AS n FROM ${sq(schemaName)}.${sq(table)}`,
    ).catch(() => null);
    const n = res?.rows?.[0]?.n;
    if (typeof n === "number" && n > 0) out.push({ table, rows: n });
  }
  return out;
}

/**
 * Creates `t_<slug>` if absent, with an empty copy of every tenant table.
 *
 * Idempotent, and deliberately cheap: one `CREATE SCHEMA IF NOT EXISTS` plus one
 * `CREATE TABLE IF NOT EXISTS ... (LIKE ...)` per table, all skipped when they
 * already exist. Safe to call on every request.
 */
export async function createOrgSchema(slug: string): Promise<string> {
  const schemaName = assertSlug(slug);
  const shared = (process.env.DATABASE_SCHEMA ?? "businessos").replace(/[^a-zA-Z0-9_]/g, "");
  const client = await pool().connect();
  try {
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${sq(schemaName)}`);
    for (const table of TENANT_TABLES) {
      await client.query(
        `CREATE TABLE IF NOT EXISTS ${sq(schemaName)}.${sq(table)} ` +
          `(LIKE ${sq(shared)}.${sq(table)} INCLUDING ALL)`,
      );
    }
  } finally {
    client.release();
  }
  return schemaName;
}

/**
 * Loads the org's `.sql` file into its schema.
 *
 * `mode: "replace"` (the default) drops the schema first, so the result is
 * exactly the file and never a merge of two histories. `mode: "merge"` keeps
 * existing objects and replays the file over them, which is what an older dump
 * onto a newer schema needs.
 */
export async function importOrgSql(
  slug: string,
  options: { mode?: "replace" | "merge"; filePath?: string } = {},
): Promise<{ schemaName: string; filePath: string; bytes: number; statements: number }> {
  const schemaName = assertSlug(slug);
  const paths = pathsFor(slug);
  const filePath = options.filePath ?? paths.sqlFile;
  if (!existsSync(filePath)) {
    throw new Error(`[org-sql] no SQL file for "${slug}" at ${filePath}`);
  }
  const bytes = statSync(filePath).size;
  if (bytes === 0) {
    throw new Error(`[org-sql] SQL file for "${slug}" is empty: ${filePath}`);
  }

  if (options.mode === "merge") {
    await createOrgSchema(slug);
  } else {
    // The dump starts with CREATE SCHEMA, so drop ours first to avoid a clash.
    await pool().query(`DROP SCHEMA IF EXISTS ${sq(schemaName)} CASCADE`);
  }

  // -v ON_ERROR_STOP=1 so a broken dump fails loudly instead of half-loading.
  // --single-transaction so a failure leaves no partial schema behind.
  await execFileAsync(
    join(pgBinDir(), "psql"),
    [
      "-h", hostOf(),
      "-p", portOf(),
      "-U", userOf(),
      "-d", databaseOf(),
      "-v", "ON_ERROR_STOP=1",
      "--single-transaction",
      "-q",
      "-f", filePath,
    ],
    { env: pgEnv(), maxBuffer: 32 * 1024 * 1024 },
  );

  const statements = countStatements(readFileSync(filePath, "utf-8"));
  appendJsonLine(paths.provisioningLog, {
    ts: new Date().toISOString(),
    slug,
    event: "sql.imported",
    schema: schemaName,
    mode: options.mode ?? "replace",
    bytes,
    statements,
  });
  return { schemaName, filePath, bytes, statements };
}

/**
 * Idempotent "open the org" step: guarantee the schema exists, and load the
 * org's `.sql` file when the schema is not there yet.
 *
 * This is what makes a folder portable — copy `database/<folder>.sql` to another
 * install, create the org there, and the first open rebuilds the data.
 */
export async function ensureOrgSchemaLoaded(
  slug: string,
  options: { force?: boolean } = {},
): Promise<{ schemaName: string; created: boolean; imported: boolean; fromFile: boolean }> {
  const schemaName = assertSlug(slug);
  const present = await schemaExists(slug);
  if (present && !options.force) {
    return { schemaName, created: false, imported: false, fromFile: false };
  }
  const paths = pathsFor(slug);
  const hasFile = existsSync(paths.sqlFile) && statSync(paths.sqlFile).size > 0;
  if (hasFile) {
    await importOrgSql(slug, { mode: "replace" });
    return { schemaName, created: true, imported: true, fromFile: true };
  }
  await createOrgSchema(slug);
  return { schemaName, created: true, imported: false, fromFile: false };
}

/**
 * Writes the org's whole schema to `database/<folder>.sql` — the sign-out save.
 *
 * `pg_dump` is pointed at the shared server with `--schema`, so the file
 * contains that org and nothing else. `--no-owner --no-privileges` keeps it
 * restorable by any role, and `--clean` is deliberately omitted: the dump's
 * `CREATE SCHEMA` is paired with a drop on import, so a file is self-contained.
 */
export async function exportOrgSql(
  slug: string,
  options: { filePath?: string } = {},
): Promise<OrgSqlInfo> {
  const schemaName = assertSlug(slug);
  const paths = pathsFor(slug);
  const filePath = options.filePath ?? paths.sqlFile;
  const existed = await schemaExists(slug);

  if (existed) {
    await execFileAsync(
      join(pgBinDir(), "pg_dump"),
      [
        "-h", hostOf(),
        "-p", portOf(),
        "-U", userOf(),
        "-d", databaseOf(),
        `--schema=${schemaName}`,
        "--no-owner",
        "--no-privileges",
        "--format=plain",
        "-f", filePath,
      ],
      { env: pgEnv(), maxBuffer: 32 * 1024 * 1024 },
    );
  } else {
    // Nothing to dump yet. Still write a valid, restorable empty schema so the
    // folder is complete and "the file exists" means the org is accounted for.
    writeFileSync(
      filePath,
      `-- Organization ${slug}: schema ${schemaName} was not present in the database at export time.\n` +
        `-- Restoring this file creates an empty ${schemaName} schema.\n` +
        `CREATE SCHEMA ${sq(schemaName)};\n`,
      "utf-8",
    );
  }

  const stat = statSync(filePath);
  if (stat.size === 0) {
    throw new Error(`[org-sql] export produced an empty file for "${slug}"`);
  }
  const buffer = readFileSync(filePath);
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const counts = existed ? await schemaRowCounts(slug) : [];
  const exportedAt = new Date().toISOString();

  writeFileSync(
    sidecarPath(filePath),
    `${JSON.stringify({ slug, schemaName, bytes: stat.size, sha256, exportedAt, tables: counts }, null, 2)}\n`,
    "utf-8",
  );
  appendJsonLine(paths.provisioningLog, {
    ts: exportedAt,
    slug,
    event: "sql.exported",
    schema: schemaName,
    bytes: stat.size,
    rowsTotal: counts.reduce((sum, c) => sum + c.rows, 0),
  });

  return {
    slug,
    schemaName,
    filePath,
    fileName: filePath.split(/[\\/]/).pop()!,
    exists: true,
    bytes: stat.size,
    sha256,
    exportedAt,
    schemaPresent: existed,
    tablesWithRows: counts,
    rowsTotal: counts.reduce((sum, c) => sum + c.rows, 0),
  };
}

/** Current state of one org's schema and `.sql` file. Read-only. */
export async function readOrgSqlInfo(slug: string): Promise<OrgSqlInfo> {
  const schemaName = assertSlug(slug);
  const paths = pathsFor(slug);
  const hasFile = existsSync(paths.sqlFile);
  let meta: Partial<OrgSqlInfo> = {};
  if (hasFile && existsSync(sidecarPath(paths.sqlFile))) {
    try {
      meta = JSON.parse(readFileSync(sidecarPath(paths.sqlFile), "utf-8"));
    } catch {
      // A corrupt sidecar must not break the admin list; fall back to stat only.
    }
  }
  const present = await schemaExists(slug);
  const counts = present ? await schemaRowCounts(slug) : [];
  return {
    slug,
    schemaName,
    filePath: paths.sqlFile,
    fileName: paths.sqlFile.split(/[\\/]/).pop()!,
    exists: hasFile,
    bytes: hasFile ? statSync(paths.sqlFile).size : 0,
    sha256: meta.sha256 ?? null,
    exportedAt: meta.exportedAt ?? null,
    schemaPresent: present,
    tablesWithRows: counts,
    rowsTotal: counts.reduce((sum, c) => sum + c.rows, 0),
  };
}

// --- connection pieces of DATABASE_URL, without pulling in a URL parser ---

function urlParts(): { host: string; port: string; user: string; database: string } {
  const u = new URL(process.env.DATABASE_URL ?? "");
  return {
    host: u.hostname || "127.0.0.1",
    port: u.port || "5432",
    user: decodeURIComponent(u.username || "postgres"),
    database: decodeURIComponent(u.pathname.replace(/^\//, "") || "postgres"),
  };
}
function hostOf(): string { return urlParts().host; }
function portOf(): string { return urlParts().port; }
function userOf(): string { return urlParts().user; }
function databaseOf(): string { return urlParts().database; }
function pgEnv(): NodeJS.ProcessEnv {
  const password = decodeURIComponent(new URL(process.env.DATABASE_URL ?? "").password || "");
  return { ...process.env, PGPASSWORD: password };
}

/** Rough statement count, for the manifest. Ignores comment-only lines. */
function countStatements(sql: string): number {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .filter((chunk) => chunk.replace(/--[^\n]*/g, "").trim().length > 0).length;
}

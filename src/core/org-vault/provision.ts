import { existsSync } from "node:fs";
import { sharedPrisma } from "@/core/db/client";
import { logger } from "@/core/logging/logger";
import { tenantSchemaName } from "@/core/tenancy/schemas";
import { syncOrgVaultFiles } from "./manifest";
import { appendJsonLine, ensureOrgVaultDirs, orgVaultPaths, writeJsonFile, type OrgVaultPaths } from "./paths";
import { getVaultEntry, touchExport, upsertVaultEntry, type VaultEntry } from "./registry";
import { ensureOrgSchemaLoaded, exportOrgSql, importOrgSql, readOrgSqlInfo, type OrgSqlInfo } from "./sql-file";

/**
 * "An organization exists, so it gets a folder."
 *
 * Called from every tenant-creation path, and directly by the backfill script.
 *
 * There is no database to start here. The org's live data lives in the schema
 * `t_<slug>` inside the one shared PostgreSQL server; this function owns the
 * FOLDER and the portable `database/<folder>.sql` copy of that schema. It is
 * idempotent, so it doubles as the repair tool.
 */

export interface ProvisionOptions {
  /** Create the org's schema (and load its .sql file if one exists). Default true. */
  schema?: boolean;
  /** Write `database/<folder>.sql` right away. Default false. */
  exportSql?: boolean;
  /** Refresh manifests at the end. Default true. */
  sync?: boolean;
}

export interface ProvisionResult {
  entry: VaultEntry;
  paths: OrgVaultPaths;
  created: boolean;
  schemaName: string;
  schemaCreated: boolean;
  schemaLoadedFromFile: boolean;
  sqlExported: boolean;
  sqlBytes: number;
  errors: string[];
}

export async function provisionOrgVault(
  org: { id: string; slug: string },
  options: ProvisionOptions = {},
): Promise<ProvisionResult> {
  const { schema = true, exportSql = false, sync = true } = options;
  const errors: string[] = [];

  // Read before the upsert, otherwise "created" is always false.
  const created = getVaultEntry(org.slug) === null;
  const entry = await upsertVaultEntry({ slug: org.slug, orgId: org.id });
  const paths = ensureOrgVaultDirs(orgVaultPaths(entry.folder));

  // Two storage locations, and this file has to name both. The ERP tenant schema
  // and the installed systems' own databases are different places, and a file that
  // described only the first while claiming to cover the org sent an operator
  // looking for a grocery product in a schema no system writes to.
  writeJsonFile(paths.connectionJson, {
    slug: entry.slug,
    organizationId: entry.orgId,
    database: {
      kind: "schema-in-shared-server",
      schema: entry.schemaName,
      grocerySchema: entry.grocerySchemaName,
      sharedDatabaseUrl: process.env.DATABASE_URL?.replace(/:[^:@/]*@/, ":***@") ?? null,
    },
    systemDatabase: {
      kind: "database-per-org",
      name: entry.databaseName,
      note: "Business systems installed for this org store all of their data here.",
    },
    notes: [
      `The ERP tenant data for this org is the schema "${entry.schemaName}" inside the shared PostgreSQL server.`,
      `Business systems installed for this org use the separate database "${entry.databaseName}" on the same server.`,
      "There is no per-org PostgreSQL server and no per-org port.",
      `The ERP tenant data is dumped to: ${paths.sqlFile}`,
      `Restore it with: psql -d <database> -f "${paths.sqlFile}"`,
    ],
    writtenAt: new Date().toISOString(),
  });

  let schemaCreated = false;
  let schemaLoadedFromFile = false;
  if (schema) {
    try {
      const loaded = await ensureOrgSchemaLoaded(org.slug);
      schemaCreated = loaded.created;
      schemaLoadedFromFile = loaded.fromFile;
      // Keep the org row's schemaName in step so tenant routing never guesses.
      await sharedPrisma.organization.update({
        where: { id: org.id },
        data: { schemaName: loaded.schemaName },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(message);
      await upsertVaultEntry({ slug: org.slug, orgId: org.id, lastError: message });
      appendJsonLine(paths.provisioningLog, {
        ts: new Date().toISOString(),
        slug: org.slug,
        event: "schema.unavailable",
        error: message,
      });
    }
  }

  let sqlExported = false;
  let sqlBytes = 0;
  if (exportSql) {
    try {
      const info = await exportOrgSql(org.slug);
      sqlExported = true;
      sqlBytes = info.bytes;
      await upsertVaultEntry({ slug: org.slug, orgId: org.id, lastExportedAt: info.exportedAt, lastError: null });
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  if (sync) {
    await syncOrgVaultFiles(org.slug).catch((err) => {
      errors.push(err instanceof Error ? err.message : String(err));
    });
  }

  const finalEntry = getVaultEntry(org.slug) ?? entry;
  appendJsonLine(paths.provisioningLog, {
    ts: new Date().toISOString(),
    slug: org.slug,
    event: "provision.completed",
    schema,
    schemaCreated,
    schemaLoadedFromFile,
    sqlExported,
    errors,
  });

  return {
    entry: finalEntry,
    paths,
    created,
    schemaName: finalEntry.schemaName || tenantSchemaName(org.slug),
    schemaCreated,
    schemaLoadedFromFile,
    sqlExported,
    sqlBytes,
    errors,
  };
}

/**
 * The "customer opens their org" step: make sure `t_<slug>` exists, loading the
 * folder's `.sql` file when the schema is missing, then refresh the folder.
 *
 * Safe to call on every page load — it is a `pg_namespace` lookup when the
 * schema is already there.
 */
export async function openOrgVault(slug: string): Promise<ProvisionResult> {
  const org = await sharedPrisma.organization.findUnique({
    where: { slug },
    select: { id: true, slug: true },
  });
  if (!org) throw new Error(`[org-vault] organization "${slug}" not found`);
  return provisionOrgVault(org, { schema: true, sync: true });
}

/**
 * The same step, but once per slug per process: after the first open the schema
 * is there, so repeat calls are a map lookup and cost nothing. Failures are not
 * cached, so a database that was briefly down is retried on the next request.
 *
 * Never rejects. It is called from request paths, and an org that cannot be
 * opened must not take the customer's page down with it — the failure is logged
 * and the org opens normally, just without its schema.
 */
const opened = new Map<string, Promise<void>>();

export function ensureOrgOpened(slug: string): Promise<void> {
  const existing = opened.get(slug);
  if (existing) return existing;
  const run = openOrgVault(slug)
    .then(() => undefined)
    .catch((err) => {
      opened.delete(slug);
      logger.error({ err, slug }, "[org-vault] open failed");
    });
  opened.set(slug, run);
  return run;
}

/** Test hook: forget which orgs this process has opened. */
export function resetOrgOpenCache(): void {
  opened.clear();
}

/**
 * The sign-out save: write the org's schema to `database/<folder>.sql`.
 *
 * Called by the sign-out endpoint and by the in-app autosave. Never throws into
 * the caller — a failed export is recorded, not propagated, because losing a
 * save must not block signing out.
 */
export async function saveOrgSql(slug: string): Promise<{ saved: boolean; bytes: number; error?: string }> {
  try {
    const info = await exportOrgSql(slug);
    // Only stamp an existing entry: an org with no folder has no orgId to
    // record, and writing a blank one would corrupt the registry.
    await touchExport(slug, info.exportedAt);
    logger.info({ slug, bytes: info.bytes, rows: info.rowsTotal }, "[org-vault] schema saved to folder");
    return { saved: true, bytes: info.bytes };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, slug }, "[org-vault] schema save failed");
    return { saved: false, bytes: 0, error: message };
  }
}

/** Creates the folder and manifests only — no schema, no export. */
export async function scaffoldOrgFolder(org: { id: string; slug: string }): Promise<ProvisionResult> {
  return provisionOrgVault(org, { schema: false, sync: true });
}

// ---------------------------------------------------------------------------
// Lifecycle helpers used by the CLI and the platform console
// ---------------------------------------------------------------------------

/** Reloads the org's schema from its `.sql` file, discarding the live copy. */
export async function restoreOrgSql(
  slug: string,
  mode: "replace" | "merge" = "replace",
): Promise<OrgSqlInfo & { statements: number }> {
  const entry = getVaultEntry(slug);
  if (!entry) throw new Error(`[org-vault] organization "${slug}" has no vault folder`);
  const imported = await importOrgSql(slug, { mode });
  appendJsonLine(orgVaultPaths(entry.folder).provisioningLog, {
    ts: new Date().toISOString(),
    slug,
    event: "sql.restored",
    mode,
  });
  return { ...(await readOrgSqlInfo(slug)), statements: imported.statements };
}

/** Verifies a folder is complete: the tree, the registry entry, and the .sql. */
export async function verifyOrgVault(slug: string): Promise<Record<string, unknown>> {
  const entry = getVaultEntry(slug);
  if (!entry) return { slug, ok: false, reason: "no registry entry" };
  const paths = orgVaultPaths(entry.folder);
  const required = [paths.orgJson, paths.systemsJson, paths.membersJson, paths.manifestJson, paths.readme, paths.connectionJson];
  const missing = required.filter((file) => {
    try {
      return !existsSync(file);
    } catch {
      return true;
    }
  });
  let sql: OrgSqlInfo | null = null;
  try {
    sql = await readOrgSqlInfo(slug);
  } catch {
    // A database that is down must not make the folder look broken.
  }
  return {
    slug,
    ok: missing.length === 0,
    folder: paths.root,
    schema: entry.schemaName,
    schemaPresent: sql?.schemaPresent ?? null,
    sqlFile: paths.sqlFile,
    sqlExists: sql?.exists ?? existsSync(paths.sqlFile),
    sqlBytes: sql?.bytes ?? 0,
    rowsTotal: sql?.rowsTotal ?? null,
    lastExportedAt: entry.lastExportedAt,
    missingFiles: missing,
  };
}

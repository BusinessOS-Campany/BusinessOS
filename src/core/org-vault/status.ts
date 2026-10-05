import { existsSync, readFileSync, statSync } from "node:fs";
import { orgVaultPaths, pathSize } from "./paths";
import { listVaultEntries, type VaultEntry } from "./registry";

/**
 * Folder-only status for the admin console: no database connection, no
 * `pg_namespace` lookup, no `count(*)` per table.
 *
 * The tenant list renders up to 200 orgs, and `readOrgSqlInfo` would be two
 * queries per org against a live database. This reads the folder and the
 * `.sql.meta.json` sidecar instead, which is enough to answer "does this org
 * have a file, how big is it, when was it last written".
 *
 * The per-org detail page uses the database-backed version.
 */

export interface VaultFileStatus {
  slug: string;
  folder: string;
  root: string;
  schemaName: string;
  folderBytes: number;
  sqlFile: string;
  sqlName: string;
  sqlExists: boolean;
  sqlBytes: number;
  sqlSha256: string | null;
  /** ISO timestamp from the sidecar written by the last successful export. */
  sqlExportedAt: string | null;
  lastError: string | null;
}

export interface VaultFileStatusOptions {
  /**
   * Walk the org folder and report its size in `folderBytes`.
   *
   * Off by default. The walk is synchronous and it descends into every installed
   * system's `node_modules` and `.next`: measured at 36 s for twelve orgs on this
   * deployment, spent on the single request that renders `/platform-admin/tenants`.
   * No page reads the number, and because the walk blocks the event loop it also
   * delays every other request the process is serving. The callers that genuinely
   * want a folder size — the `org-vault` CLI, the manifest writer — call `pathSize`
   * themselves, off the request path.
   */
  folderBytes?: boolean;
}

function safeStat(file: string): number | null {
  try {
    return statSync(file).size;
  } catch {
    return null;
  }
}

/** One org's file status. Never throws: a missing folder reads as "no file". */
export function readVaultFileStatus(
  entry: VaultEntry,
  options: VaultFileStatusOptions = {},
): VaultFileStatus {
  const paths = orgVaultPaths(entry.folder);
  const sqlBytes = safeStat(paths.sqlFile);
  let sha256: string | null = null;
  let sqlExportedAt: string | null = null;
  if (sqlBytes !== null && existsSync(`${paths.sqlFile}.meta.json`)) {
    try {
      const meta = JSON.parse(readFileSync(`${paths.sqlFile}.meta.json`, "utf-8")) as {
        sha256?: string;
        exportedAt?: string;
      };
      sha256 = meta.sha256 ?? null;
      sqlExportedAt = meta.exportedAt ?? null;
    } catch {
      // A truncated sidecar must not break the list; the size is still known.
    }
  }
  return {
    slug: entry.slug,
    folder: entry.folder,
    root: paths.root,
    schemaName: entry.schemaName,
    folderBytes: options.folderBytes && safeStat(paths.root) !== null ? pathSize(paths.root) : 0,
    sqlFile: paths.sqlFile,
    sqlName: paths.sqlFile.split(/[\\/]/).pop() ?? paths.sqlFile,
    sqlExists: sqlBytes !== null,
    sqlBytes: sqlBytes ?? 0,
    sqlSha256: sha256,
    // An empty string is treated as missing, not as a timestamp: it shadows
    // the registry value otherwise, and the console would render "Invalid Date".
    sqlExportedAt: sqlExportedAt || entry.lastExportedAt,
    lastError: entry.lastError,
  };
}

/**
 * Every registered org's file status, keyed by slug.
 *
 * Folder size is not measured here — this is the call the tenant list makes, once
 * per render, for every org.
 */
export function readAllVaultFileStatus(): Record<string, VaultFileStatus> {
  const out: Record<string, VaultFileStatus> = {};
  for (const entry of listVaultEntries()) out[entry.slug] = readVaultFileStatus(entry);
  return out;
}

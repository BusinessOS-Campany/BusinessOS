import { sanitizeFolderName, slugFingerprint, readJsonFile, registryFile, ensureDir, registryDir, writeJsonFile, orgVaultRoot } from "./paths";
import { grocerySchemaName, tenantSchemaName } from "@/core/tenancy/schemas";
import { orgDatabaseName } from "./database";

/**
 * Vault registry: the single index of every organization folder.
 *
 * It exists to solve the one thing the folder tree cannot answer on its own:
 * slug -> folder name, because slug sanitisation is not always reversible
 * (`a_b` and `a-b` both reduce to `a-b`).
 *
 * There is deliberately no port, no cluster state and no password here. Every
 * org is a SCHEMA in the one shared PostgreSQL server and its portable copy is
 * `database/<folder>.sql`, so there is nothing to allocate, start or stop.
 *
 * Writes are serialised through a promise chain because two tenants signing up
 * at the same moment would otherwise read-modify-write over each other and
 * silently lose one of the two entries.
 */

/**
 * Version 3 adds `databaseName`: the org's own PostgreSQL database, alongside
 * the `t_<slug>` schema it keeps in the shared server. The system clones run as
 * their own processes and connect to this database, while the ERP modules keep
 * using the schema.
 */
export const REGISTRY_VERSION = 3;

export interface VaultEntry {
  /** The org's real slug, verbatim. The folder name may differ (see `folder`). */
  slug: string;
  orgId: string;
  folder: string;
  /** The org's schema in the shared server. */
  schemaName: string;
  grocerySchemaName: string;
  /** The org's own database on the same server, for its profile/data/systems. */
  databaseName: string;
  createdAt: string;
  updatedAt: string;
  /** ISO timestamp of the last successful SQL export, or null. */
  lastExportedAt: string | null;
  /** Set when the last provisioning attempt failed; cleared on success. */
  lastError: string | null;
}

export interface VaultRegistry {
  version: number;
  root: string;
  orgs: Record<string, VaultEntry>;
}

export function emptyRegistry(): VaultRegistry {
  return {
    version: REGISTRY_VERSION,
    root: orgVaultRoot(),
    orgs: {},
  };
}

let cache: VaultRegistry | null = null;

/** Serialises registry mutations so concurrent writes cannot interleave. */
let writeChain: Promise<unknown> = Promise.resolve();

function load(): VaultRegistry {
  if (cache) return cache;
  const file = registryFile();
  const read = readJsonFile<VaultRegistry | null>(file, null);
  if (read && read.orgs) {
    if (read.version === REGISTRY_VERSION) {
      // Env may have changed since the file was written (the root is config).
      read.root = orgVaultRoot();
      cache = read;
      return cache;
    }
    const migrated = migrateLegacyRegistry(read);
    // Written straight away: every folder in the tree is addressed by the
    // folder names this file records, so losing them orphans real orgs.
    persist(migrated);
    cache = migrated;
    return cache;
  }
  cache = emptyRegistry();
  return cache;
}

/**
 * Version 1 recorded a per-org cluster (port, user, password, database name,
 * start/stop timestamps) and version 2 dropped all of it. Version 3 brings the
 * database name back, but as a plain name on the shared server rather than a
 * separate cluster, so there is still nothing to allocate, start or stop.
 *
 * The folder mapping is the truth for folders on disk, so `slug`/`orgId`/
 * `folder`/`schemaName` are carried over and everything else is derived.
 */
function migrateLegacyRegistry(legacy: VaultRegistry): VaultRegistry {
  const orgs: Record<string, VaultEntry> = {};
  for (const [slug, raw] of Object.entries(legacy.orgs)) {
    const old = raw as VaultEntry & { createdAt?: string; updatedAt?: string; databaseName?: string };
    const folder = old.folder;
    orgs[slug] = {
      slug,
      orgId: old.orgId,
      folder,
      schemaName: old.schemaName || tenantSchemaName(slug),
      grocerySchemaName: old.grocerySchemaName || grocerySchemaName(slug),
      databaseName: old.databaseName || orgDatabaseName(folder),
      createdAt: old.createdAt ?? new Date().toISOString(),
      updatedAt: old.updatedAt ?? new Date().toISOString(),
      lastExportedAt: null,
      lastError: null,
    };
  }
  return { version: REGISTRY_VERSION, root: orgVaultRoot(), orgs };
}

/** Forces the next read to hit disk. Used by tests and after external edits. */
export function resetRegistryCache(): void {
  cache = null;
}

export function getRegistry(): VaultRegistry {
  return load();
}

export function getVaultEntry(slug: string): VaultEntry | null {
  return load().orgs[slug] ?? null;
}

export function listVaultEntries(): VaultEntry[] {
  return Object.values(load().orgs).sort((a, b) => a.slug.localeCompare(b.slug));
}

function persist(registry: VaultRegistry): void {
  ensureDir(registryDir());
  writeJsonFile(registryFile(), registry);
}

/**
 * Runs `mutate` against the registry and writes the result back, with writes
 * serialised. The callback receives the live registry object and may mutate it
 * in place; whatever it returns is passed through to the caller.
 */
export function withRegistry<T>(mutate: (registry: VaultRegistry) => T | Promise<T>): Promise<T> {
  const run = writeChain.then(async () => {
    const registry = load();
    const result = await mutate(registry);
    persist(registry);
    return result;
  });
  // Keep the chain alive even if this mutation rejects, otherwise one failed
  // write would permanently poison every later registry write.
  writeChain = run.catch(() => undefined);
  return run;
}

/**
 * Folder name for a slug, breaking sanitisation collisions deterministically.
 *
 * `a b` and `a-b` both sanitise to `a-b`; the first slug to claim it keeps it
 * and the second gets `a-b--<fingerprint>`. Deterministic because the decision
 * only depends on the registry's existing claim, which is committed before the
 * entry is created.
 */
export function folderForSlug(slug: string, registry: VaultRegistry = load()): string {
  const sanitized = sanitizeFolderName(slug);
  for (const entry of Object.values(registry.orgs)) {
    if (entry.folder === sanitized && entry.slug !== slug) {
      return `${sanitized.slice(0, MAX_SUFFIX_BASE)}--${slugFingerprint(slug)}`;
    }
  }
  return sanitized;
}

const MAX_SUFFIX_BASE = 48;

export async function upsertVaultEntry(
  patch: Partial<VaultEntry> & Pick<VaultEntry, "slug" | "orgId">,
): Promise<VaultEntry> {
  return withRegistry((registry) => {
    const now = new Date().toISOString();
    const existing = registry.orgs[patch.slug];
    const entry: VaultEntry = {
      slug: patch.slug,
      orgId: patch.orgId,
      folder: existing?.folder ?? folderForSlug(patch.slug, registry),
      schemaName: patch.schemaName ?? existing?.schemaName ?? tenantSchemaName(patch.slug),
      grocerySchemaName: patch.grocerySchemaName ?? existing?.grocerySchemaName ?? grocerySchemaName(patch.slug),
      databaseName:
        patch.databaseName ?? existing?.databaseName ?? orgDatabaseName(existing?.folder ?? folderForSlug(patch.slug, registry)),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      lastExportedAt: patch.lastExportedAt !== undefined ? patch.lastExportedAt : (existing?.lastExportedAt ?? null),
      lastError: patch.lastError !== undefined ? patch.lastError : (existing?.lastError ?? null),
    };
    registry.orgs[patch.slug] = entry;
    return entry;
  });
}

export async function removeVaultEntry(slug: string): Promise<boolean> {
  return withRegistry((registry) => {
    const existed = Boolean(registry.orgs[slug]);
    delete registry.orgs[slug];
    return existed;
  });
}

/**
 * Stamps a successful SQL export on an existing entry.
 *
 * Separate from `upsertVaultEntry` because the sign-out and autosave paths only
 * have a slug: they must not create an entry with a blank `orgId`, and they must
 * not invent one.
 */
export async function touchExport(slug: string, exportedAt: string | null): Promise<boolean> {
  return withRegistry((registry) => {
    const entry = registry.orgs[slug];
    if (!entry) return false;
    entry.lastExportedAt = exportedAt;
    entry.updatedAt = new Date().toISOString();
    return true;
  });
}

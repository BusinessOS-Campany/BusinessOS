import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { currentTenantContext } from "@/core/tenancy/context-store";
import { getVaultEntry } from "./registry";
import { orgVaultPaths, type OrgVaultPaths } from "./paths";

/**
 * Organization-scoped file storage.
 *
 * The existing `StorageProvider` in `core/integrations/storage.ts` writes
 * everything under one global `STORAGE_PATH`. That is correct for
 * user-scoped artifacts (avatars) but wrong for an org's files: the whole
 * point of the vault is that an org's uploads live in the org's own folder, so
 * the folder is genuinely self-sufficient and can be backed up or handed over
 * on its own.
 *
 * `OrgStorage` is the same interface, resolved to `<org folder>/files`. It is
 * used for exports, imports and org-owned media. When no tenant context is
 * active (platform console, jobs, scripts) it falls back to the global
 * provider, so nothing has to special-case "am I in a tenant?".
 */

export interface OrgStorageProvider {
  write(relativePath: string, data: Buffer): Promise<string>;
  read(relativePath: string): Promise<Buffer>;
  delete(relativePath: string): Promise<void>;
  getUrl(relativePath: string): string;
  /** Absolute root the provider is writing into. */
  root(): string;
}

/** Rejects anything that could escape the org folder. */
function safeRelative(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized) throw new Error("[org-vault] storage path is empty");
  if (normalized.split("/").some((segment) => segment === "..")) {
    throw new Error(`[org-vault] refusing storage path outside the org folder: ${relativePath}`);
  }
  return normalized;
}

class FolderStorage implements OrgStorageProvider {
  private base: string;

  constructor(base: string) {
    this.base = base;
    if (!existsSync(this.base)) mkdirSync(this.base, { recursive: true });
  }

  private resolve(relativePath: string): string {
    return join(this.base, safeRelative(relativePath));
  }

  async write(relativePath: string, data: Buffer): Promise<string> {
    const full = this.resolve(relativePath);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, data);
    return relativePath;
  }

  async read(relativePath: string): Promise<Buffer> {
    const full = this.resolve(relativePath);
    if (!existsSync(full)) throw new Error(`[org-vault] file not found: ${relativePath}`);
    return readFileSync(full);
  }

  async delete(relativePath: string): Promise<void> {
    const full = this.resolve(relativePath);
    if (existsSync(full)) unlinkSync(full);
  }

  getUrl(relativePath: string): string {
    return this.resolve(relativePath);
  }

  root(): string {
    return this.base;
  }
}

/** The org's file root inside its vault, or null when the org has no folder. */
export function orgFilesRoot(slug: string): string | null {
  const entry = getVaultEntry(slug);
  if (!entry) return null;
  return orgVaultPaths(entry.folder).files;
}

/** Storage bound to one org folder. */
export function storageForPaths(paths: OrgVaultPaths): OrgStorageProvider {
  return new FolderStorage(paths.files);
}

/**
 * Storage bound to the CURRENT tenant's folder.
 *
 * Returns null when there is no tenant context or the tenant has no vault
 * folder yet — callers then fall back to the global provider, so provisioning
 * lag can never break file access.
 */
export function currentOrgStorage(): OrgStorageProvider | null {
  const tenant = currentTenantContext();
  if (!tenant?.slug) return null;
  const root = orgFilesRoot(tenant.slug);
  return root ? new FolderStorage(root) : null;
}

/** True when the current request is inside a tenant that has a vault folder. */
export function hasOrgStorage(): boolean {
  return currentOrgStorage() !== null;
}

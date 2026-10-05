/**
 * Organization vault — one self-contained folder per tenant under
 * `orginazition/`, holding everything the platform knows about that
 * organization: profile, systems, people, files, data exports, logs, backups
 * and its database as ONE portable SQL file.
 *
 * There is no per-organization PostgreSQL server. Every org is a schema
 * (`t_<slug>`) inside the one shared server, and `database/<folder>.sql` is the
 * portable copy — written on sign-out, loaded back when the org is opened.
 *
 * Entry point for callers is `./provision` (`provisionOrgVault`,
 * `openOrgVault`, `saveOrgSql`). The sub-modules are:
 *
 *   paths.ts     folder layout — the single source of truth for every path
 *   registry.ts  slug -> folder index (no ports, no cluster state)
 *   sql-file.ts  export/import the org's schema as one .sql file
 *   manifest.ts  org.json / systems.json / members.json / manifest.json / README
 *   storage.ts   org-scoped file storage under `<folder>/files`
 *   logger.ts    per-org app + audit logs under `<folder>/logs`
 *   provision.ts orchestration: create folder, open org, save on sign-out
 */
export {
  ensureOrgVaultDirs,
  orgVaultPaths,
  orgVaultRoot,
  pathSize,
  readJsonFile,
  registryFile,
  sanitizeFolderName,
  slugFingerprint,
  systemSourceRoot,
  writeJsonFile,
  appendJsonLine,
  type OrgVaultPaths,
} from "./paths";

export {
  folderForSlug,
  getRegistry,
  getVaultEntry,
  listVaultEntries,
  removeVaultEntry,
  upsertVaultEntry,
  withRegistry,
  type VaultEntry,
  type VaultRegistry,
} from "./registry";

export {
  closeOrgSqlPools,
  createOrgSchema,
  ensureOrgSchemaLoaded,
  exportOrgSql,
  importOrgSql,
  readOrgSqlInfo,
  schemaExists,
  schemaRowCounts,
  type OrgSqlInfo,
} from "./sql-file";

export {
  buildManifest,
  buildMembersManifest,
  buildOrgProfile,
  buildSystemsManifest,
  syncOrgVaultFiles,
} from "./manifest";

export { currentOrgStorage, hasOrgStorage, orgFilesRoot, storageForPaths, type OrgStorageProvider } from "./storage";

export { logOrgAudit, logOrgRequest, tailOrgLog, writeOrgLog, type OrgLogStream } from "./logger";

export {
  openOrgVault,
  provisionOrgVault,
  restoreOrgSql,
  saveOrgSql,
  scaffoldOrgFolder,
  verifyOrgVault,
  type ProvisionOptions,
  type ProvisionResult,
} from "./provision";

export { isOrgVaultEnabled, onOrganizationCreated, onOrganizationOpened } from "./on-create";

export {
  cloneSystemForOrg,
  hasSystemSource,
  listSystemSources,
  orgSystemDir,
  systemSourceDir,
  type CloneResult,
  type CloneStamp,
} from "./system-clone";

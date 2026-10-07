import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * Filesystem layout for the organization vault — `orginazition/` at the repo
 * root. Every tenant gets ONE self-contained folder named after its slug that
 * holds everything about that organization: profile, systems, uploaded files,
 * data exports, logs, backups, and its own PostgreSQL data directory.
 *
 * <root>/
 *   _registry/registry.json        index of every org folder (slug -> folder, schema)
 *   _shared/                       vault-wide assets (this README lives next to it)
 *   <slug>/                        one folder per organization
 *     org.json                     profile: name, slug, plan, status, settings, branding
 *     systems.json                 installed systems/apps + runtime endpoints
 *     members.json                 members and their roles (org-scoped profile data)
 *     manifest.json                machine-readable inventory + provisioning state
 *     README.md                    human-readable summary, regenerated on every sync
 *     database/
 *       connection.json            the org's schema name and how to dump/restore it
 *       <folder>.sql               the org's whole database as one portable SQL file
 *       backups/                   dated pg_dump snapshots of the same schema
 *     data/                        data exports by domain (JSON + CSV)
 *     files/                       uploaded files, media, generated exports
 *     exports/  media/  imports/
 *     systems/<slug>/              this org's own copy of each installed system
 *     logs/                        app.log, audit.log, provisioning.log
 *
 * There is no per-org PostgreSQL cluster. Every org is a SCHEMA (`t_<slug>`)
 * inside the one shared server, and `database/<folder>.sql` is the portable
 * copy: written on sign-out, loaded back when the org is opened.
 *
 * Layout is stable: `orgVaultPaths()` is the single source of truth for every
 * path in this feature, so nothing else in the codebase hard-codes a segment.
 */

/** Windows device names that cannot be used as a directory name. */
const RESERVED_WINDOWS_NAMES = new Set([
  "con", "prn", "aux", "nul",
  ...Array.from({ length: 9 }, (_, i) => `com${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `lpt${i + 1}`),
]);

/** Longest folder name we will emit. Windows caps a path segment at 255 chars. */
const MAX_FOLDER_LENGTH = 64;

/**
 * Root of the vault. `ORG_VAULT_PATH` wins; otherwise `orginazition/` beside
 * the repo. Resolved to an absolute path so a later `process.chdir()` (tests,
 * scripts) cannot move a vault out from under an open file handle.
 */
export function orgVaultRoot(): string {
  const configured = process.env.ORG_VAULT_PATH?.trim();
  return resolve(configured ? configured : join(process.cwd(), "orginazition"));
}

/** Folder holding vault-wide state (the registry). Never an org folder. */
export function registryDir(): string {
  return join(orgVaultRoot(), "_registry");
}

/**
 * Root of the pristine system sources that get cloned into each org.
 *
 * `SYSTEM_SOURCE_PATH` wins; otherwise `system/` beside the repo. Deliberately
 * NOT the `orginazition/systems` folder — that one holds org-owned copies, this
 * one is the read-only master every clone starts from.
 */
export function systemSourceRoot(): string {
  const configured = process.env.SYSTEM_SOURCE_PATH?.trim();
  return resolve(configured ? configured : join(process.cwd(), "system"));
}

export function registryFile(): string {
  return join(registryDir(), "registry.json");
}

/**
 * Turns an org slug into a filesystem-safe folder name.
 *
 * Slugs are already URL-safe by the time they reach us, but this function is
 * the last gate before `join()` on Windows, so it handles: case, everything
 * outside `[a-z0-9._-]`, dot-only names (`.`/`..`), reserved device names
 * (`con`, `lpt1`, …), and the 255-char path limit.
 */
export function sanitizeFolderName(slug: string): string {
  let name = slug
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[.\-]+/, "")
    .replace(/[.\-]+$/, "")
    .replace(/-{2,}/g, "-");

  if (name.length > MAX_FOLDER_LENGTH) name = name.slice(0, MAX_FOLDER_LENGTH).replace(/[.\-]+$/, "");
  if (!name) name = "org";
  // `con` is a device, not a directory — no extension escape either, since
  // Windows only reserves the bare stem.
  if (RESERVED_WINDOWS_NAMES.has(name.split(".")[0])) name = `_${name}`;
  return name;
}

/**
 * Deterministic 8-hex fingerprint of the raw slug, used only to break a
 * sanitisation collision (two different slugs that reduce to one folder name).
 */
export function slugFingerprint(slug: string): string {
  return createHash("sha256").update(slug).digest("hex").slice(0, 8);
}

/** Every path inside one org's vault folder. */
export interface OrgVaultPaths {
  /** Folder name inside the vault root (sanitised slug). */
  folder: string;
  /** Absolute path of the org's vault folder. */
  root: string;
  orgJson: string;
  systemsJson: string;
  membersJson: string;
  manifestJson: string;
  readme: string;
  databaseDir: string;
  connectionJson: string;
  backups: string;
  /** The org's portable database: a plain-SQL dump of its `t_<slug>` schema. */
  sqlFile: string;
  data: string;
  files: string;
  fileExports: string;
  fileMedia: string;
  fileImports: string;
  /** Root of this org's private copies of every installed system. */
  systems: string;
  logs: string;
  appLog: string;
  auditLog: string;
  provisioningLog: string;
  /** Directory a set of path names, created on demand. */
  resolve(...segments: string[]): string;
}

export function orgVaultPaths(folder: string): OrgVaultPaths {
  const root = join(orgVaultRoot(), folder);
  const databaseDir = join(root, "database");
  const files = join(root, "files");
  const logs = join(root, "logs");
  return {
    folder,
    root,
    orgJson: join(root, "org.json"),
    systemsJson: join(root, "systems.json"),
    membersJson: join(root, "members.json"),
    manifestJson: join(root, "manifest.json"),
    readme: join(root, "README.md"),
    databaseDir,
    connectionJson: join(databaseDir, "connection.json"),
    backups: join(databaseDir, "backups"),
    sqlFile: join(databaseDir, `${folder}.sql`),
    data: join(root, "data"),
    files,
    fileExports: join(files, "exports"),
    fileMedia: join(files, "media"),
    fileImports: join(files, "imports"),
    systems: join(root, "systems"),
    logs,
    appLog: join(logs, "app.log"),
    auditLog: join(logs, "audit.log"),
    provisioningLog: join(logs, "provisioning.log"),
    resolve: (...segments) => join(root, ...segments),
  };
}

/** `mkdir -p`. */
export function ensureDir(dir: string): string {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/** Creates the full org folder tree. Idempotent. */
export function ensureOrgVaultDirs(paths: OrgVaultPaths): OrgVaultPaths {
  for (const dir of [
    paths.root,
    paths.databaseDir,
    paths.backups,
    paths.data,
    paths.files,
    paths.fileExports,
    paths.fileMedia,
    paths.fileImports,
    paths.systems,
    paths.logs,
  ]) {
    ensureDir(dir);
  }
  return paths;
}

/**
 * Writes JSON atomically (temp file + rename). A crash mid-write can therefore
 * never leave a truncated `org.json` behind — the whole point of these files is
 * that they are the record of an org, and a corrupt record is worse than none.
 */
export function writeJsonFile(file: string, value: unknown): void {
  ensureDir(dirname(file));
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
  renameSync(tmp, file);
}

/** Reads JSON, returning `fallback` when the file is missing or unparseable. */
export function readJsonFile<T>(file: string, fallback: T): T {
  try {
    if (!existsSync(file)) return fallback;
    return JSON.parse(readFileSync(file, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

/**
 * Appends one JSON object as a line. Used for the per-org log files.
 * Never throws: a logging failure must not abort the operation it describes.
 */
export function appendJsonLine(file: string, entry: Record<string, unknown>): void {
  try {
    ensureDir(dirname(file));
    appendFileSync(file, `${JSON.stringify(entry)}\n`, "utf-8");
  } catch {
    // Intentionally swallowed.
  }
}

/** Size in bytes of a directory tree, or of a single file. Missing -> 0. */
export function pathSize(target: string): number {
  let total = 0;
  const stat = statSync(target, { throwIfNoEntry: false });
  if (!stat) return 0;
  if (!stat.isDirectory()) return stat.size;
  const entries = readdirSync(target, { withFileTypes: true });
  for (const entry of entries) {
    const name = entry.name;
    if (entry.isDirectory()) {
      if (name === "node_modules" || name === ".next" || name === ".git") continue;
      total += pathSize(join(target, name));
      continue;
    }
    if (entry.isFile()) {
      const statEntry = statSync(join(target, name));
      total += statEntry.size;
    }
  }
  return total;
}

/** Removes a directory tree. Used only by the explicit `destroy` path. */
export function removeTree(target: string): void {
  rmSync(target, { recursive: true, force: true });
}

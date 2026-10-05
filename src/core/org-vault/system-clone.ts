import { cpSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { logger } from "@/core/logging/logger";
import {
  appendJsonLine,
  ensureDir,
  orgVaultPaths,
  readJsonFile,
  writeJsonFile,
  type OrgVaultPaths,
} from "./paths";
import { hasSystemSource, systemSourceDir } from "./system-sources";
import { getVaultEntry } from "./registry";

/**
 * Per-org copies of installed systems.
 *
 * `system/<slug>/` at the repo root is the pristine master. When an org
 * installs a system, the master is COPIED into that org's own folder at
 * `orginazition/<org>/systems/<slug>/`, so every customer owns a private,
 * editable copy of the system it paid for and one org can never see or change
 * another's.
 *
 * The clone is files only. The UI is served by the in-shell module
 * (`/app/grocery`, `/app/sama-center`) and the org's live data stays in its own
 * schema `t_<slug>`; `database/<folder>.sql` remains the portable copy of that
 * schema. Booting one Node process per org is deliberately out of scope.
 *
 * Idempotent: a folder that already carries a `.clone.json` stamp is left
 * alone, so re-installing or re-syncing never clobbers an org's edits.
 */

/**
 * Never copied into a clone. `node_modules` alone is hundreds of megabytes and
 * `.next` is a build artifact — both are reproducible from the source, and
 * copying them would make an "install" take minutes for no benefit.
 */
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", ".turbo", ".vercel", "dist", "coverage"]);

/**
 * Files never copied. An org's `.env` would carry the master's database URL and
 * auth secret; the runtime injects this org's own values when it starts the
 * process, so shipping the master's would leak a secret and point every customer
 * at one database.
 */
function isSkippedFile(name: string): boolean {
  return name === ".env" || (name.startsWith(".env.") && name !== ".env.example");
}

/** Marker written into every completed clone, and the reason we can skip re-runs. */
const CLONE_STAMP = ".clone.json";

export interface CloneStamp {
  systemSlug: string;
  orgSlug: string;
  source: string;
  clonedAt: string;
  files: number;
}

export interface CloneResult {
  /** False when the system has no folder under the source root. */
  cloned: boolean;
  /** True when this call did the copy, false when a prior clone was reused. */
  fresh: boolean;
  path: string;
  files: number;
  reason?: string;
}

// Discovery of `system/<slug>/` lives in `system-sources.ts` so `next.config.ts`
// can build its rewrite table from the same list without pulling this module
// (and its logger) into the config loader. Re-exported here because "which
// systems can be cloned" is nearly always asked alongside the clone itself.
export { hasSystemSource, listSystemSources, systemSourceDir } from "./system-sources";

/** Absolute path of one org's private copy of a system. */
export function orgSystemDir(paths: OrgVaultPaths, systemSlug: string): string {
  return join(paths.systems, systemSlug);
}

/**
 * Copies `system/<slug>/` into `<org folder>/systems/<slug>/`.
 *
 * Never throws: a failed clone must not fail the install that triggered it, so
 * the error is logged and the provisioning log gets the reason. Returns
 * `cloned: false` with a `reason` when there is nothing to clone from.
 */
export function cloneSystemForOrg(
  org: { slug: string },
  systemSlug: string,
): CloneResult {
  const entry = getVaultEntry(org.slug);
  const paths = orgVaultPaths(entry?.folder ?? org.slug);
  const target = orgSystemDir(paths, systemSlug);
  const source = systemSourceDir(systemSlug);

  if (!hasSystemSource(systemSlug)) {
    const reason = `no source folder at ${source}`;
    logger.warn({ orgSlug: org.slug, systemSlug }, "[system-clone] skipped");
    return { cloned: false, fresh: false, path: target, files: 0, reason };
  }

  const existing = readJsonFile<CloneStamp | null>(join(target, CLONE_STAMP), null);
  if (existing?.systemSlug === systemSlug && existsSync(target)) {
    return { cloned: true, fresh: false, path: target, files: existing.files };
  }

  try {
    ensureDir(target);
    cpSync(source, target, {
      recursive: true,
      // Keep an org's own edits: a re-clone overwrites only the files the master
      // actually ships, and a file the org deleted stays deleted.
      force: true,
      errorOnExist: false,
      filter: (from) => {
        const name = from.split(/[\\/]/).pop() ?? "";
        return !SKIP_DIRS.has(name) && !isSkippedFile(name);
      },
    });
    const files = countFiles(target);
    const stamp: CloneStamp = {
      systemSlug,
      orgSlug: org.slug,
      source,
      clonedAt: new Date().toISOString(),
      files,
    };
    writeJsonFile(join(target, CLONE_STAMP), stamp);
    appendJsonLine(paths.provisioningLog, {
      ts: stamp.clonedAt,
      slug: org.slug,
      event: "system.cloned",
      systemSlug,
      target,
      files,
    });
    logger.info({ orgSlug: org.slug, systemSlug, files }, "[system-clone] system cloned into org");
    return { cloned: true, fresh: true, path: target, files };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, orgSlug: org.slug, systemSlug }, "[system-clone] clone failed");
    appendJsonLine(paths.provisioningLog, {
      ts: new Date().toISOString(),
      slug: org.slug,
      event: "system.clone_failed",
      systemSlug,
      error: message,
    });
    return { cloned: false, fresh: false, path: target, files: 0, reason: message };
  }
}

/** Source files in a clone, excluding the directories we never copy. */
function countFiles(dir: string): number {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    if (entry.isDirectory()) total += countFiles(join(dir, entry.name));
    else total += 1;
  }
  return total;
}

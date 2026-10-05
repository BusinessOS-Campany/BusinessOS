import "../src/core/config/load-env";
import { sharedPrisma } from "@/core/db/client";
import { orgVaultPaths, pathSize } from "@/core/org-vault/paths";
import { isOrgVaultEnabled } from "@/core/org-vault/on-create";
import { provisionOrgVault, verifyOrgVault } from "@/core/org-vault/provision";
import { closeOrgSqlPools } from "@/core/org-vault/sql-file";
import { getRegistry, listVaultEntries } from "@/core/org-vault/registry";
import { cloneSystemForOrg, listSystemSources } from "@/core/org-vault/system-clone";

/**
 * Backfills an `orginazition/<slug>/` folder for every organization that does
 * not have one, creates each org's `t_<slug>` schema, and writes its
 * `database/<folder>.sql` snapshot.
 *
 * Resumable and idempotent: re-running skips orgs that already have a folder
 * (`--force` re-syncs them) and re-running mid-way continues where it stopped.
 *
 * The org's data is never moved or deleted — the schema in the shared server
 * stays the live store, and the .sql is a copy of it.
 *
 * Run: npx tsx scripts/backfill-org-vaults.ts [options]
 *
 *   --folder-only   folders + manifests only, no schema, no SQL file (fastest)
 *   --schemas       create each org's t_<slug> schema (default)
 *   --sql           also write database/<folder>.sql for every org
 *   --systems       clone every installed system's source into systems/<slug>/
 *   --force         re-provision orgs that already have a folder
 *   --limit <n>     stop after n orgs
 *   --slug <slug>   only this org
 *   --dry-run       print the plan, change nothing
 */

interface Options {
  folderOnly: boolean;
  sql: boolean;
  systems: boolean;
  force: boolean;
  limit: number | null;
  slug: string | null;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    folderOnly: false,
    sql: false,
    systems: false,
    force: false,
    limit: null,
    slug: null,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--folder-only": options.folderOnly = true; break;
      case "--schemas": options.folderOnly = false; break;
      case "--sql": options.sql = true; break;
      case "--systems": options.systems = true; break;
      case "--force": options.force = true; break;
      case "--dry-run": options.dryRun = true; break;
      case "--limit": options.limit = Number(argv[++i]); break;
      case "--slug": options.slug = argv[++i]; break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
      default:
        throw new Error(`Unknown option "${arg}" — run with --help`);
    }
  }
  return options;
}

function printHelp(): void {
  console.log(`
Backfill organization vault folders (orginazition/<slug>/)

  --folder-only   folders + manifests only (fastest, no database work)
  --schemas       create each org's t_<slug> schema (default)
  --sql           also write database/<folder>.sql for every org
  --systems       clone each installed system into systems/<slug>/
  --force         re-provision orgs that already have a folder
  --limit <n>     stop after n orgs
  --slug <slug>   only this organization
  --dry-run       print the plan, change nothing
`);
}

function human(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

/**
 * Copies `system/<slug>/` into `orginazition/<org>/systems/<slug>/` for every
 * (org, installed system) pair. Idempotent — an org that already has the clone
 * is reported as `kept`, so this is safe to re-run after adding a new system to
 * the source root.
 */
async function backfillSystemClones(
  orgs: { id: string; slug: string }[],
  dryRun: boolean,
): Promise<void> {
  const sources = listSystemSources();
  console.log(`[systems] source root has ${sources.length} system(s): ${sources.join(", ") || "none"}`);
  if (sources.length === 0) return;

  const installs = await sharedPrisma.organizationApp.findMany({
    where: { organizationId: { in: orgs.map((o) => o.id) } },
    select: { organizationId: true, app: { select: { slug: true } } },
  });
  const orgSlugById = new Map(orgs.map((o) => [o.id, o.slug]));

  const pairs = installs
    .map((i) => ({ orgSlug: orgSlugById.get(i.organizationId)!, systemSlug: i.app.slug }))
    .filter((p) => sources.includes(p.systemSlug));

  console.log(`[systems] ${pairs.length} cloneable install(s) across ${orgs.length} org(s)`);
  if (dryRun) {
    for (const p of pairs) console.log(`  would clone ${p.systemSlug} -> ${p.orgSlug}`);
    return;
  }

  for (const p of pairs) {
    const result = cloneSystemForOrg({ slug: p.orgSlug }, p.systemSlug);
    const state = result.fresh ? `cloned (${result.files} files)` : result.cloned ? "already present" : `skipped: ${result.reason}`;
    console.log(`  ${p.orgSlug} / ${p.systemSlug} ${state}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!isOrgVaultEnabled()) {
    throw new Error("ORG_VAULT_ENABLED=0 — the org vault is switched off");
  }

  const orgs = await sharedPrisma.organization.findMany({
    select: { id: true, slug: true, name: true, status: true },
    orderBy: { createdAt: "asc" },
  });

  let targets = orgs;
  if (options.slug) targets = targets.filter((org) => org.slug === options.slug);
  if (options.limit !== null) targets = targets.slice(0, options.limit);

  const existing = new Set(listVaultEntries().map((entry) => entry.slug));
  const toCreate = targets.filter((org) => options.force || !existing.has(org.slug));
  const toSkip = targets.length - toCreate.length;

  const mode = options.folderOnly ? "folders only" : options.sql ? "folders + schemas + SQL" : "folders + schemas";
  console.log(`[backfill] organizations: ${orgs.length}`);
  console.log(`[backfill] selected:       ${targets.length}`);
  console.log(`[backfill] already have a folder (skipped): ${toSkip}`);
  console.log(`[backfill] to provision:   ${toCreate.length}`);
  console.log(`[backfill] mode:           ${mode}${options.dryRun ? " (DRY RUN)" : ""}`);

  if (options.dryRun) {
    for (const org of toCreate) console.log(`  would provision ${org.slug} (${org.name})`);
    return;
  }

  // Installations that predate the per-org clone: give every org a private copy
  // of each system it has. Runs for ALL selected orgs, not just the ones missing
  // a folder, because an org can have a folder and still predate this feature.
  if (options.systems) {
    await backfillSystemClones(targets, options.dryRun);
  }

  const started = Date.now();
  let done = 0;
  let failed = 0;
  let withErrors = 0;
  const failures: { slug: string; error: string }[] = [];

  for (const org of toCreate) {
    const label = `[${done + 1}/${toCreate.length}] ${org.slug}`;
    try {
      const result = await provisionOrgVault(org, {
        schema: !options.folderOnly,
        exportSql: options.sql,
        sync: true,
      });
      done += 1;
      if (result.errors.length > 0) {
        withErrors += 1;
        console.log(`${label} OK with ${result.errors.length} error(s): ${result.errors[0]}`);
      } else {
        const from = result.schemaLoadedFromFile ? " (loaded from .sql)" : "";
        const sql = result.sqlExported ? ` sql=${human(result.sqlBytes)}` : "";
        console.log(`${label} ok folder=${result.paths.folder} schema=${result.schemaName}${from}${sql}`);
      }
    } catch (err) {
      failed += 1;
      const error = err instanceof Error ? err.message : String(err);
      failures.push({ slug: org.slug, error });
      console.log(`${label} FAILED: ${error}`);
    }

    if (done % 10 === 0 && done > 0) {
      const elapsed = (Date.now() - started) / 1000;
      const rate = elapsed / done;
      console.log(
        `[backfill] ${done} done, ${toCreate.length - done} left, ${rate.toFixed(2)}s/org, ` +
          `eta ${((toCreate.length - done) * rate / 60).toFixed(1)}min`,
      );
    }
  }

  const totalSize = listVaultEntries().reduce((sum, entry) => sum + pathSize(orgVaultPaths(entry.folder).root), 0);
  const minutes = ((Date.now() - started) / 60000).toFixed(1);

  console.log("");
  console.log(`[backfill] done in ${minutes}min`);
  console.log(`[backfill] provisioned: ${done}, with errors: ${withErrors}, failed: ${failed}`);
  console.log(`[backfill] registry entries: ${Object.keys(getRegistry().orgs).length}`);
  console.log(`[backfill] vault size: ${human(totalSize)}`);
  if (failures.length > 0) {
    console.log("[backfill] failures:");
    for (const failure of failures) console.log(`  - ${failure.slug}: ${failure.error}`);
  }

  if (!options.dryRun && toCreate.length > 0) {
    const sample = toCreate[Math.floor(toCreate.length / 2)];
    const verification = await verifyOrgVault(sample.slug);
    console.log(
      `[backfill] verify ${sample.slug}: ok=${verification.ok} schema=${verification.schema} ` +
        `present=${verification.schemaPresent} sql=${human(Number(verification.sqlBytes) || 0)} rows=${verification.rowsTotal ?? "n/a"}`,
    );
  }

  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(
      "[backfill] failed:",
      process.env.ORG_VAULT_DEBUG && err instanceof Error ? err.stack : err instanceof Error ? err.message : err,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeOrgSqlPools().catch(() => undefined);
    await sharedPrisma.$disconnect().catch(() => undefined);
  });

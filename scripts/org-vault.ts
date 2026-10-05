import { statSync } from "node:fs";
import "../src/core/config/load-env";
import { sharedPrisma } from "@/core/db/client";
import { syncOrgVaultFiles } from "@/core/org-vault/manifest";
import { orgVaultPaths, orgVaultRoot, pathSize } from "@/core/org-vault/paths";
import {
  openOrgVault,
  provisionOrgVault,
  restoreOrgSql,
  saveOrgSql,
  verifyOrgVault,
} from "@/core/org-vault/provision";
import { closeOrgSqlPools, exportOrgSql, readOrgSqlInfo } from "@/core/org-vault/sql-file";
import { listVaultEntries } from "@/core/org-vault/registry";

/**
 * Operator CLI for the organization vault.
 *
 * Run: npx tsx scripts/org-vault.ts <command> [--slug <slug>] [options]
 *
 *   list                 every org folder with its schema, SQL file and size
 *   status  --slug <s>   full detail for one org
 *   sync   --slug <s>    refresh org.json / systems.json / members.json / manifest
 *   create --slug <s>    create the folder, schema and .sql for an org
 *   open   --slug <s>    the customer opens their org: ensure schema, load .sql if absent
 *   export --slug <s>    pg_dump the org's schema into database/<folder>.sql
 *   save   --slug <s>    the sign-out save (export, never fatal on failure)
 *   import --slug <s>    load database/<folder>.sql back into the schema
 *   sql    --slug <s>    read-only report on the .sql file and its schema
 *   verify --slug <s>    check the folder is complete
 *
 * Global flags: --json (machine-readable), --all (every org, for list/status).
 */

interface Args {
  command: string;
  slug: string | null;
  all: boolean;
  json: boolean;
  rest: string[];
}

function parseArgs(argv: string[]): Args {
  const [command = "list", ...argvRest] = argv;
  // A separate array: leftovers are collected into `rest`, and pushing onto the
  // array being iterated would make the loop grow forever.
  const args: Args = { command, slug: null, all: false, json: false, rest: [] };
  for (let i = 0; i < argvRest.length; i += 1) {
    switch (argvRest[i]) {
      case "--slug": args.slug = argvRest[++i]; break;
      case "--all": args.all = true; break;
      case "--json": args.json = true; break;
      default: args.rest.push(argvRest[i]);
    }
  }
  return args;
}

function requireSlug(args: Args): string {
  if (!args.slug) throw new Error("This command needs --slug <slug>");
  return args.slug;
}

function human(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function targetSlugs(args: Args): string[] {
  return args.all ? listVaultEntries().map((e) => e.slug) : [requireSlug(args)];
}

/** The `missingFiles` list from `verifyOrgVault`, as a printable string. */
function missingList(detail: Record<string, unknown>): string {
  const missing = detail.missingFiles;
  return Array.isArray(missing) ? missing.join(", ") : "";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const out = (value: unknown) => {
    if (args.json) console.log(JSON.stringify(value, null, 2));
  };

  switch (args.command) {
    case "list": {
      const entries = listVaultEntries();
      if (args.json) {
        out(entries);
        break;
      }
      console.log(`vault root : ${orgVaultRoot()}`);
      console.log(`orgs       : ${entries.length}`);
      console.log("");
      console.log("SLUG".padEnd(34) + "SQL".padEnd(11) + "SIZE".padEnd(11) + "LAST EXPORT".padEnd(26) + "FOLDER");
      for (const entry of entries) {
        const paths = orgVaultPaths(entry.folder);
        const size = pathSize(paths.root);
        const sqlSize = sqlSizeLabel(paths.sqlFile);
        console.log(
          entry.slug.padEnd(34) +
            sqlSize.padEnd(11) +
            human(size).padEnd(11) +
            String(entry.lastExportedAt ?? "never").padEnd(26) +
            entry.folder,
        );
      }
      const total = entries.reduce((sum, e) => sum + pathSize(orgVaultPaths(e.folder).root), 0);
      console.log("");
      console.log(`total: ${human(total)}`);
      break;
    }

    case "status": {
      for (const slug of targetSlugs(args)) {
        const detail = await verifyOrgVault(slug);
        if (args.json) { out(detail); continue; }
        const entry = listVaultEntries().find((e) => e.slug === slug)!;
        const paths = orgVaultPaths(entry.folder);
        console.log(`${slug}`);
        console.log(`  folder      ${paths.root}`);
        console.log(`  schema      ${entry.schemaName} (present=${detail.schemaPresent})`);
        console.log(`  sql file    ${paths.sqlFile} (${human(Number(detail.sqlBytes) || 0)})`);
        console.log(`  size        ${human(pathSize(paths.root))}`);
        console.log(`  complete    ${detail.ok}${missingList(detail) ? ` (missing: ${missingList(detail)})` : ""}`);
        console.log(`  rows        ${detail.rowsTotal ?? "n/a"}`);
        console.log(`  lastExport  ${entry.lastExportedAt ?? "never"}`);
        if (entry.lastError) console.log(`  lastError   ${entry.lastError}`);
        console.log("");
      }
      break;
    }

    case "sync": {
      for (const slug of targetSlugs(args)) {
        const result = await syncOrgVaultFiles(slug);
        const rows = (result.manifest.data as { rowsTotal: number }).rowsTotal;
        console.log(`synced ${slug} -> ${result.paths.folder} (rows=${rows})`);
      }
      break;
    }

    case "create": {
      const slug = requireSlug(args);
      const org = await sharedPrisma.organization.findUnique({ where: { slug }, select: { id: true, slug: true, name: true } });
      if (!org) throw new Error(`No organization with slug "${slug}"`);
      const folderOnly = args.rest.includes("--folder-only");
      const result = await provisionOrgVault(org, { schema: !folderOnly, exportSql: !folderOnly, sync: true });
      out(result);
      console.log(
        `created ${slug} -> ${result.paths.root} (schema ${result.schemaName}, sql ${human(result.sqlBytes)})` +
          (result.schemaLoadedFromFile ? " loaded from file" : ""),
      );
      if (result.errors.length > 0) console.log(`errors: ${result.errors.join("; ")}`);
      break;
    }

    case "open": {
      const result = await openOrgVault(requireSlug(args));
      out(result);
      console.log(
        `opened ${result.entry.slug}: schema ${result.schemaName} ` +
          `(${result.schemaLoadedFromFile ? "loaded from .sql" : result.schemaCreated ? "created empty" : "already present"})`,
      );
      if (result.errors.length > 0) console.log(`errors: ${result.errors.join("; ")}`);
      break;
    }

    case "export": {
      const info = await exportOrgSql(requireSlug(args));
      out(info);
      console.log(`dumped ${info.slug} -> ${info.filePath} (${human(info.bytes)}, rows ${info.rowsTotal})`);
      if (info.sha256) console.log(`sha256 ${info.sha256}`);
      break;
    }

    case "save": {
      const result = await saveOrgSql(requireSlug(args));
      out(result);
      console.log(result.saved ? `saved ${human(result.bytes)}` : `save failed: ${result.error}`);
      if (!result.saved) process.exitCode = 1;
      break;
    }

    case "import": {
      const mode = args.rest.includes("--merge") ? "merge" : "replace";
      const info = await restoreOrgSql(requireSlug(args), mode);
      out(info);
      console.log(`loaded ${info.filePath} into ${info.schemaName} (${human(info.bytes)}, ${info.statements} statements)`);
      break;
    }

    case "sql": {
      const info = await readOrgSqlInfo(requireSlug(args));
      out(info);
      console.log(`${info.slug}`);
      console.log(`  schema      ${info.schemaName} (present=${info.schemaPresent})`);
      console.log(`  file        ${info.filePath}`);
      console.log(`  exists      ${info.exists} (${human(info.bytes)})`);
      console.log(`  sha256      ${info.sha256 ?? "-"}`);
      console.log(`  exportedAt  ${info.exportedAt ?? "never"}`);
      console.log(`  rows        ${info.rowsTotal}`);
      break;
    }

    case "verify": {
      const slugs = targetSlugs(args);
      let bad = 0;
      for (const slug of slugs) {
        const detail = await verifyOrgVault(slug);
        if (!detail.ok) {
          bad += 1;
          console.log(`FAIL ${slug}: missing ${missingList(detail)}`);
        }
      }
      console.log(`verified ${slugs.length} folder(s), ${bad} incomplete`);
      if (bad > 0) process.exitCode = 1;
      break;
    }

    default:
      console.error(`Unknown command "${args.command}"`);
      console.error("Commands: list status sync create open export save import sql verify");
      process.exitCode = 2;
  }
}

/** Human size of the .sql file, or "-" when the org has never been exported. */
function sqlSizeLabel(sqlFile: string): string {
  try {
    return human(statSync(sqlFile).size);
  } catch {
    return "-";
  }
}

main()
  .catch((err) => {
    // ORG_VAULT_DEBUG=1 prints the stack, which is how the "Invalid array
    // length" from a self-growing argv loop was tracked down.
    console.error("[org-vault]", process.env.ORG_VAULT_DEBUG && err instanceof Error ? err.stack : err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeOrgSqlPools().catch(() => undefined);
    await sharedPrisma.$disconnect().catch(() => undefined);
  });

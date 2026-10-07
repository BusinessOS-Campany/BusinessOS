/**
 * Reports every installed system whose pristine source was removed.
 *
 * An install is a copy of `system/<slug>/` into the org's vault, but the
 * platform re-reads `system/` at request time: `/{org}/{system}` refuses a
 * segment with no source folder. So deleting a system's source silently strands
 * every org that installed it — the clone is still on disk, the card still says
 * "Open", and the link 404s with nothing explaining why.
 *
 * This is the one command that names the divergence, read-only and safe to run
 * against production:
 *
 *   npx tsx scripts/orphaned-systems.ts          # report; exit 1 if any found
 *   npx tsx scripts/orphaned-systems.ts --json   # machine-readable
 *
 * The fix is to restore `system/<slug>/`; the card already reports these
 * installs as `unavailable` rather than offering a link that cannot work.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

for (const file of [".env.local", ".env"]) {
  try {
    for (const raw of readFileSync(join(process.cwd(), file), "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 1) continue;
      const key = line.slice(0, eq).trim();
      if (process.env[key] === undefined) process.env[key] = line.slice(eq + 1).trim();
    }
    break;
  } catch {
    /* try the next file */
  }
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const { listSystemSources } = await import("../src/core/org-vault/system-sources");
  const { orphanedInstalledSlugs } = await import("../src/core/systems/catalog");

  const sources = listSystemSources();

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query<{ org: string; slug: string }>(
      `SELECT o.slug AS org, a.slug AS slug
         FROM organization_apps oa
         JOIN apps a ON a.id = oa.app_id
         JOIN organizations o ON o.id = oa.organization_id
        ORDER BY a.slug, o.slug`,
    );

    const orphans = orphanedInstalledSlugs(rows.map((row) => row.slug), sources);

    if (orphans.length === 0) {
      console.log(
        `No orphaned installs: all ${new Set(rows.map((r) => r.slug)).size} installed system(s) have a source under system/.`,
      );
      return;
    }

    if (process.argv.includes("--json")) {
      console.log(JSON.stringify({ sources, orphans, installs: rows }, null, 2));
      process.exitCode = 1;
      return;
    }

    console.log(`${orphans.length} installed system(s) have no source under system/:\n`);
    for (const slug of orphans) {
      const orgs = rows.filter((row) => row.slug === slug).map((row) => row.org);
      console.log(
        `  - ${slug}  (${orgs.length} org${orgs.length === 1 ? "" : "s"}): ${orgs.join(", ")}`,
      );
    }
    console.log(
      "\nThese cards now report `unavailable`. Restore system/<slug>/ to serve them again.",
    );
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
/**
 * Read-only inventory of organizations, to tell real tenants from the ones that
 * automated runs left behind. Deletes nothing; prints what a cleanup would touch.
 *
 *   npx tsx scripts/org-inventory.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

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
import { Client } from "pg";

/** Slug prefixes/names produced by automated runs, with the run that made each. */
const TEST_PATTERNS: Array<[RegExp, string]> = [
  [/^IsoA-/, "session isolation probe (IsoA)"],
  [/^IsoB-/, "session isolation probe (IsoB)"],
  [/^revoked-/, "revoked-session probe"],
  [/^cred-/, "credential isolation probe"],
  [/^perfprobe-/, "performance probe"],
  [/^orgrouteprobe-/, "org-route probe"],
  [/^syslinkprobe-/, "syslink probe"],
];

function classify(slug: string): string | null {
  for (const [re, origin] of TEST_PATTERNS) if (re.test(slug)) return origin;
  return null;
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const c = new Client({ connectionString: url });
  await c.connect();

  const { rows } = await c.query<{
    id: string;
    name: string;
    slug: string;
    status: string;
    created_at: Date;
    database_name: string | null;
    members: number;
    org_apps: number;
    sessions: number;
  }>(`
    SELECT o.id, o.name, o.slug, o.status, o.created_at, o.database_name,
      (SELECT count(*)::int FROM businessos.members m WHERE m.organization_id = o.id) AS members,
      (SELECT count(*)::int FROM businessos.organization_apps a WHERE a.organization_id = o.id) AS org_apps,
      (SELECT count(*)::int FROM businessos.sessions s WHERE s.active_organization_id = o.id) AS sessions
    FROM businessos.organizations o
    ORDER BY o.created_at
  `);

  const vault = process.env.ORG_VAULT_PATH?.trim() || join(process.cwd(), "orginazition");

  const keep: typeof rows = [];
  const drop: Array<{ row: (typeof rows)[number]; origin: string; folder: boolean }> = [];

  for (const row of rows) {
    const origin = classify(row.slug);
    if (origin) drop.push({ row, origin, folder: existsSync(join(vault, row.slug)) });
    else keep.push(row);
  }

  console.log(`\n=== KEEP (${keep.length}) ===`);
  for (const r of keep) {
    console.log(
      `  ${r.slug.padEnd(34)} members=${r.members} apps=${r.org_apps} sessions=${r.sessions}` +
        ` folder=${existsSync(join(vault, r.slug)) ? "yes" : "NO"} db=${r.database_name ?? "-"}` +
        ` created=${r.created_at.toISOString().slice(0, 10)}`,
    );
  }

  console.log(`\n=== DELETE CANDIDATES (${drop.length}) ===`);
  const byOrigin = new Map<string, number>();
  for (const d of drop) byOrigin.set(d.origin, (byOrigin.get(d.origin) ?? 0) + 1);
  for (const [origin, n] of [...byOrigin].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${origin}`);
  }

  const folders = drop.filter((d) => d.folder);
  const members = drop.reduce((n, d) => n + d.row.members, 0);
  const apps = drop.reduce((n, d) => n + d.row.org_apps, 0);
  const sessions = drop.reduce((n, d) => n + d.row.sessions, 0);
  const dbs = drop.filter((d) => d.row.database_name);
  console.log(
    `\n  totals: members=${members} orgApps=${apps} activeSessions=${sessions} ` +
      `foldersOnDisk=${folders.length} databases=${dbs.length}`,
  );
  if (folders.length) console.log(`  folders: ${folders.map((d) => d.row.slug).join(", ")}`);
  if (dbs.length) console.log(`  databases: ${dbs.map((d) => `${d.row.slug}=${d.row.database_name}`).join(", ")}`);

  console.log(`\n  full list: ${drop.map((d) => d.row.slug).join(" ")}\n`);
  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
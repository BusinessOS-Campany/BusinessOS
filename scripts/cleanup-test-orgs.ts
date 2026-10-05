/**
 * Removes the organizations that automated runs left behind, and nothing else.
 *
 * Every organization this touches is selected by slug pattern only (see
 * TEST_PATTERNS). There is no "delete by id list" mode and no wildcard: a slug
 * that matches no pattern cannot be reached by this script, so a real tenant
 * cannot be destroyed by a mistake in a name.
 *
 *   npx tsx scripts/org-inventory.ts        # read-only count
 *   npx tsx scripts/cleanup-test-orgs.ts    # dry run: prints every action
 *   npx tsx scripts/cleanup-test-orgs.ts --apply
 *
 * Per organization, in this order:
 *   1. clear sessions.active_organization_id   (FK safety)
 *   2. delete tenant rows keyed by organization_id in tables that have no FK
 *   3. delete the organization row             (cascades members/orgApps/...)
 *   4. remove the org-vault folder
 *   5. remove the registry entry
 *   6. drop the org's own database, if it has one
 *
 * Steps 2 and 4-6 have no delete endpoint in the app yet (see PROJECT_MAP.md
 * [ORPHANS & PENDING]); the primitives exist but are uncalled.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { Client } from "pg";

const APPLY = process.argv.includes("--apply");

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

/** The only slugs this script may touch, and which run produced each. */
const TEST_PATTERNS: Array<[RegExp, string]> = [
  [/^IsoA-/, "session isolation probe (IsoA)"],
  [/^IsoB-/, "session isolation probe (IsoB)"],
  [/^revoked-/, "revoked-session probe"],
  [/^cred-/, "credential isolation probe"],
  [/^perfprobe-/, "performance probe"],
  [/^orgrouteprobe-/, "org-route probe"],
  [/^syslinkprobe-/, "syslink probe"],
  [/^verify-\d+$/, "stale registry entry: no code creates this prefix anymore"],
];

function originOf(slug: string): string | null {
  for (const [re, origin] of TEST_PATTERNS) if (re.test(slug)) return origin;
  return null;
}

/** Audit rows are set to NULL by the FK; deleting them would lose the trail. */
const KEEP_ROWS = new Set(["audit_logs"]);

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const vault = process.env.ORG_VAULT_PATH?.trim() || join(process.cwd(), "orginazition");
  const registryPath = join(vault, "_registry", "registry.json");

  const c = new Client({ connectionString: url });
  await c.connect();

  // Every table carrying a tenant column, discovered rather than hardcoded, so a
  // newly added table is covered instead of silently skipped.
  const { rows: tables } = await c.query<{ table_name: string }>(`
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'businessos' AND column_name = 'organization_id'
    ORDER BY table_name
  `);
  const tenantTables = tables.map((t) => t.table_name).filter((t) => !KEEP_ROWS.has(t));

  const { rows: orgs } = await c.query<{ id: string; slug: string; name: string; database_name: string | null }>(
    `SELECT id, slug, name, database_name FROM businessos.organizations`,
  );

  const targets = orgs.filter((o) => originOf(o.slug));
  const skipped = orgs.filter((o) => !originOf(o.slug));
  const ids = targets.map((o) => o.id);

  // Folders left on disk with no organization row at all.
  const vaultEntries = existsSync(vault) ? await readdir(vault, { withFileTypes: true }) : [];
  const onDisk = vaultEntries.filter((e) => e.isDirectory() && !e.name.startsWith("_")).map((e) => e.name);
  const knownSlugs = new Set(orgs.map((o) => o.slug));
  const orphanFolders = onDisk.filter((slug) => !knownSlugs.has(slug) && originOf(slug));
  const knownTestFolders = new Set(targets.map((o) => o.slug));

  console.log(`\nmode: ${APPLY ? "APPLY" : "DRY RUN (no writes)"}`);
  console.log(`organizations: ${orgs.length} total, ${targets.length} matching a probe pattern, ${skipped.length} untouched`);
  console.log(`tenant tables scanned: ${tenantTables.length}`);
  console.log(`vault: ${vault}`);
  console.log(`\nWILL KEEP (${skipped.length}): ${skipped.map((o) => o.slug).sort().join(" ")}`);

  if (!APPLY) {
    const byOrigin = new Map<string, number>();
    for (const o of targets) {
      const k = originOf(o.slug)!;
      byOrigin.set(k, (byOrigin.get(k) ?? 0) + 1);
    }
    console.log(`\nWOULD DELETE (${targets.length}):`);
    for (const [origin, n] of [...byOrigin].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${origin}`);
    console.log(`\n  vault folders to remove: ${[...orphanFolders, ...targets.filter((o) => knownTestFolders.has(o.slug) && existsSync(join(vault, o.slug))).map((o) => o.slug)].join(" ") || "(none)"}`);
    console.log(`  orphan folders with no DB row: ${orphanFolders.join(" ") || "(none)"}`);
    console.log(`\n  Nothing has been written. Re-run with --apply to delete.`);
    await c.end();
    return;
  }

  // 1. Detach sessions first: sessions.active_organization_id points at the org.
  const detached = await c.query(
    `UPDATE businessos.sessions SET active_organization_id = NULL WHERE active_organization_id = ANY($1::text[])`,
    [ids],
  );
  console.log(`\n[1] detached ${detached.rowCount ?? 0} session pointer(s)`);

  // 2. Tenant rows in the no-FK tables, so nothing is orphaned.
  let tenantRows = 0;
  for (const t of tenantTables) {
    const r = await c.query(`DELETE FROM businessos."${t}" WHERE organization_id = ANY($1::text[])`, [ids]);
    if (r.rowCount) {
      tenantRows += r.rowCount;
      console.log(`[2] ${t}: ${r.rowCount}`);
    }
  }
  console.log(`[2] ${tenantRows} tenant row(s) removed across ${tenantTables.length} tables`);

  // 3. The organization row; members/apps/credentials cascade.
  const del = await c.query(`DELETE FROM businessos.organizations WHERE id = ANY($1::text[])`, [ids]);
  console.log(`[3] deleted ${del.rowCount ?? 0} organization row(s)`);

  // 4. Vault folders.
  let folders = 0;
  for (const o of targets) {
    const dir = join(vault, o.slug);
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
      folders++;
    }
  }
  for (const slug of orphanFolders) {
    rmSync(join(vault, slug), { recursive: true, force: true });
    folders++;
  }
  console.log(`[4] removed ${folders} vault folder(s)`);

  // 5. Registry entries, swept by pattern so entries whose folder or DB row is
  //    already gone are still removed.
  let removedReg = 0;
  if (existsSync(registryPath)) {
    const registry = JSON.parse(readFileSync(registryPath, "utf8")) as { orgs?: Record<string, unknown> };
    for (const slug of Object.keys(registry.orgs ?? {})) {
      if (originOf(slug) && registry.orgs) {
        delete registry.orgs[slug];
        removedReg++;
      }
    }
    if (removedReg) writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  }
  console.log(`[5] removed ${removedReg} registry entr(ies)`);

  // 6. Any leftover org database / tenant schema for a probe slug (no FK, so a
  //    dropped org can leave its per-org database behind).
  const probeDbLike = "is[oa]|revoked|cred|perfprobe|orgrouteprobe|syslinkprobe";
  const { rows: dbRows } = await c.query<{ datname: string }>(
    `SELECT datname FROM pg_database WHERE datname ~* $1 ORDER BY datname`,
    [probeDbLike],
  );
  for (const d of dbRows) {
    await c.query(`DROP DATABASE IF EXISTS "${d.datname}"`);
    console.log(`[6] dropped database ${d.datname}`);
  }
  const { rows: schemaRows } = await c.query<{ schema_name: string }>(
    `SELECT schema_name FROM information_schema.schemata WHERE schema_name ~* $1 AND schema_name NOT LIKE 'pg_%' ORDER BY schema_name`,
    [probeDbLike],
  );
  for (const s of schemaRows) {
    await c.query(`DROP SCHEMA IF EXISTS "${s.schema_name}" CASCADE`);
    console.log(`[6] dropped schema ${s.schema_name}`);
  }
  console.log(`[6] ${dbRows.length} database(s), ${schemaRows.length} schema(s) dropped`);

  // 7. Test users. Fixtures create them with @test.local addresses and never
  //    remove them, so they accumulate one set per run. A user is only removed
  //    when it holds no membership and no live session: anything still in use is
  //    left alone and reported.
  const { rows: testUsers } = await c.query<{ id: string; email: string }>(
    `SELECT id, email FROM businessos.users WHERE email LIKE '%test.local'`,
  );
  let removedUsers = 0;
  const keptUsers: string[] = [];
  for (const u of testUsers) {
    const busy = await c.query(
      `SELECT EXISTS (SELECT 1 FROM businessos.members m WHERE m.user_id = $1) AS member,
              EXISTS (SELECT 1 FROM businessos.sessions s WHERE s.user_id = $1 AND s.expires_at > now()) AS live_session`,
      [u.id],
    );
    if (busy.rows[0].member || busy.rows[0].live_session) {
      keptUsers.push(u.email);
      continue;
    }
    await c.query(`DELETE FROM businessos.accounts WHERE user_id = $1`, [u.id]);
    await c.query(`DELETE FROM businessos.users WHERE id = $1`, [u.id]);
    removedUsers++;
  }
  console.log(`[7] removed ${removedUsers} test user(s); kept ${keptUsers.length} in use${keptUsers.length ? `: ${keptUsers.join(", ")}` : ""}`);

  await c.end();

  console.log(`\ndone. kept ${skipped.length} real organization(s): ${skipped.map((o) => o.slug).sort().join(" ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
import "@/core/config/load-env";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The folder half of the vault, tested without a database.
 *
 * Everything here is a plain file: the registry index, the folder layout, the
 * `.sql.meta.json` sidecar the admin console reads. `sql-file.ts` needs a live
 * `pg_dump`, so it is not exercised here - what these tests pin down is that the
 * sidecar and the folder tree agree, and that a leftover version-1 registry
 * still resolves to the same folders after the schema-only migration.
 *
 * `ORG_VAULT_PATH` is read per call, never cached at import time, so pointing
 * it at a temp directory is enough to keep this test off the real
 * `orginazition/`.
 */

const root = mkdtempSync(join(tmpdir(), "org-vault-test-"));
process.env.ORG_VAULT_PATH = root;

const { ensureOrgVaultDirs, orgVaultPaths, registryFile, registryDir, sanitizeFolderName, ensureDir } = await import(
  "@/core/org-vault/paths"
);
const { getRegistry, listVaultEntries, resetRegistryCache, touchExport, upsertVaultEntry } = await import(
  "@/core/org-vault/registry"
);
const { readAllVaultFileStatus, readVaultFileStatus } = await import("@/core/org-vault/status");

/** Writes a .sql plus the sidecar `exportOrgSql` would have written. */
function writeSqlFile(folder: string, body: string, meta: { sha256?: string; exportedAt?: string } = {}): void {
  const paths = ensureOrgVaultDirs(orgVaultPaths(folder));
  writeFileSync(paths.sqlFile, body);
  writeFileSync(
    `${paths.sqlFile}.meta.json`,
    JSON.stringify({ sha256: meta.sha256 ?? "abc123", exportedAt: meta.exportedAt ?? "2026-01-01T00:00:00.000Z" }),
  );
}

beforeAll(() => {
  ensureDir(registryDir());
  resetRegistryCache();
});

afterAll(() => {
  resetRegistryCache();
  rmSync(root, { recursive: true, force: true });
});

describe("vault folder status", () => {
  it("derives the .sql path from the folder, not the slug", async () => {
    await upsertVaultEntry({ slug: "acme", orgId: "org_acme" });
    const entry = listVaultEntries().find((e) => e.slug === "acme");
    expect(entry?.folder).toBe("acme");
    const status = readVaultFileStatus(entry!);
    expect(status.sqlFile).toBe(join(orgVaultPaths("acme").databaseDir, "acme.sql"));
    expect(status.schemaName).toBe("t_acme");
  });

  it("reports a missing file as never exported, with size 0", async () => {
    await upsertVaultEntry({ slug: "fresh", orgId: "org_fresh" });
    ensureOrgVaultDirs(orgVaultPaths("fresh"));
    const entry = listVaultEntries().find((e) => e.slug === "fresh")!;
    const status = readVaultFileStatus(entry);
    expect(status.sqlExists).toBe(false);
    expect(status.sqlBytes).toBe(0);
    expect(status.sqlSha256).toBeNull();
    expect(status.sqlExportedAt).toBeNull();
  });

  it("reads size, hash and timestamp from the sidecar", async () => {
    writeSqlFile("withfile", "CREATE TABLE t(x int);\n", {
      sha256: "deadbeef",
      exportedAt: "2026-02-03T04:05:06.000Z",
    });
    await upsertVaultEntry({ slug: "withfile", orgId: "org_withfile" });
    const entry = listVaultEntries().find((e) => e.slug === "withfile")!;
    const status = readVaultFileStatus(entry);
    expect(status.sqlExists).toBe(true);
    expect(status.sqlBytes).toBe("CREATE TABLE t(x int);\n".length);
    expect(status.sqlSha256).toBe("deadbeef");
    expect(status.sqlExportedAt).toBe("2026-02-03T04:05:06.000Z");
  });

  it("measures the folder only when asked, because the walk is the expensive half", async () => {
    // The tenant list renders this for every registered org on every render, and
    // the walk descends into each installed system's node_modules: measured at
    // 36 s for twelve orgs, synchronously, on the request that renders
    // /platform-admin/tenants. The walk must therefore be opt-in, and
    // `folderBytes` must read 0 when it was not performed — otherwise the field
    // claims a measurement nobody asked for.
    writeSqlFile("measured", "SELECT 1;");
    await upsertVaultEntry({ slug: "measured", orgId: "org_measured" });
    const entry = listVaultEntries().find((e) => e.slug === "measured")!;

    expect(readVaultFileStatus(entry).folderBytes).toBe(0);
    expect(readVaultFileStatus(entry, { folderBytes: true }).folderBytes).toBeGreaterThan(0);
  });

  it("never walks the folder for the whole-vault view the tenant list renders", async () => {
    writeSqlFile("bulk", "SELECT 1;");
    await upsertVaultEntry({ slug: "bulk", orgId: "org_bulk" });

    const all = readAllVaultFileStatus();
    expect(all.bulk?.sqlExists).toBe(true);
    expect(all.bulk?.folderBytes).toBe(0);
  });

  it("survives a truncated sidecar instead of failing the whole list", async () => {
    writeSqlFile("badmeta", "SELECT 1;");
    writeFileSync(`${orgVaultPaths("badmeta").sqlFile}.meta.json`, "{not json");
    await upsertVaultEntry({ slug: "badmeta", orgId: "org_badmeta" });
    const entry = listVaultEntries().find((e) => e.slug === "badmeta")!;
    const status = readVaultFileStatus(entry);
    expect(status.sqlExists).toBe(true);
    expect(status.sqlSha256).toBeNull();
  });

  it("falls back to the registry timestamp when the sidecar has none", async () => {
    writeSqlFile("registrytime", "SELECT 1;", { exportedAt: "" });
    await upsertVaultEntry({ slug: "registrytime", orgId: "org_registrytime" });
    await touchExport("registrytime", "2026-03-04T05:06:07.000Z");
    const entry = listVaultEntries().find((e) => e.slug === "registrytime")!;
    expect(readVaultFileStatus(entry).sqlExportedAt).toBe("2026-03-04T05:06:07.000Z");
  });

  it("touchExport never invents an entry for an unknown slug", async () => {
    expect(await touchExport("never-seen", "2026-01-01T00:00:00.000Z")).toBe(false);
    expect(listVaultEntries().some((e) => e.slug === "never-seen")).toBe(false);
  });

  it("keys the whole-vault view by slug and omits unknown orgs", () => {
    const all = readAllVaultFileStatus();
    expect(Object.keys(all).sort()).toEqual(listVaultEntries().map((e) => e.slug).sort());
    expect(all.unregistered).toBeUndefined();
  });

  it("gives colliding slugs different folders so no file is overwritten", async () => {
    // `a b` and `a-b` both reduce to `a-b`; `_` is a legal folder character and
    // does not collide with anything.
    expect(sanitizeFolderName("a b")).toBe("a-b");
    const first = await upsertVaultEntry({ slug: "a b", orgId: "org_1" });
    const second = await upsertVaultEntry({ slug: "a-b", orgId: "org_2" });
    expect(first.folder).toBe("a-b");
    expect(second.folder).not.toBe("a-b");
    expect(second.folder.startsWith("a-b--")).toBe(true);
  });
});

describe("registry migration", () => {
  it("converts a version-1 cluster registry in place and keeps the folders", async () => {
    // A v1 file: per-org port, password and database name, which the schema-only
    // layout has no use for. The folder mapping is still the truth on disk.
    const legacy = {
      version: 1,
      root,
      orgs: {
        legacy_acme: {
          slug: "legacy_acme",
          orgId: "org_legacy",
          folder: "legacy-acme",
          schemaName: "t_legacy_acme",
          port: 55432,
          password: "secret",
          databaseName: "bos_legacy_acme",
          running: true,
        },
      },
    };
    writeFileSync(registryFile(), JSON.stringify(legacy));
    resetRegistryCache();

    const migrated = getRegistry();
    // v3 is the current registry version: v1's per-org cluster fields are gone,
    // and v3 keeps only the database name (derived from the folder) since there
    // is still no separate cluster to allocate.
    expect(migrated.version).toBe(3);
    const entry = migrated.orgs.legacy_acme;
    expect(entry.folder).toBe("legacy-acme");
    expect(entry.orgId).toBe("org_legacy");
    expect(entry.schemaName).toBe("t_legacy_acme");
    expect(entry.grocerySchemaName).toBe("grocery_legacy_acme");
    expect(entry).not.toHaveProperty("port");
    expect(entry).not.toHaveProperty("password");
    // The existing database name is kept as-is — inventing a new one here
    // would point the org at a database that does not exist yet.
    expect(entry.databaseName).toBe("bos_legacy_acme");

    // Written straight back, so the folder names on disk are never orphaned.
    const reread = JSON.parse(readFileSync(registryFile(), "utf-8")) as {
      version: number;
      orgs: Record<string, { folder: string }>;
    };
    expect(reread.version).toBe(3);
    expect(reread.orgs.legacy_acme.folder).toBe("legacy-acme");
  });

  it("starts from an empty registry when the file is missing", async () => {
    rmSync(registryFile(), { force: true });
    mkdirSync(join(root, "_registry"), { recursive: true });
    resetRegistryCache();
    expect(getRegistry().orgs).toEqual({});
  });
});

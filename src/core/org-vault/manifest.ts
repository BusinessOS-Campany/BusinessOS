import { writeFileSync } from "node:fs";
import { sharedPrisma } from "@/core/db/client";
import { openRouteForSlug, openRouteForSystem, servesPerOrg, systemKind } from "@/core/systems/catalog";
import { listSystemSources } from "./system-sources";
import {
  appendJsonLine,
  ensureOrgVaultDirs,
  orgVaultPaths,
  pathSize,
  writeJsonFile,
  type OrgVaultPaths,
} from "./paths";
import { getVaultEntry, type VaultEntry } from "./registry";

/**
 * Writes the human- and machine-readable record of an organization into its
 * folder: `org.json` (profile), `systems.json` (installed systems),
 * `members.json` (org-scoped people data), `manifest.json` (inventory +
 * provisioning state) and `README.md`.
 *
 * These are SNAPSHOTS of the live database, refreshed on demand. The live
 * database stays the source of truth — nothing in the app reads these files at
 * runtime, which is what makes them safe to regenerate, hand-edit or delete
 * without breaking a tenant.
 */

/** Fields copied into `org.json`. Settings/branding are passed through as-is. */
export async function buildOrgProfile(orgId: string): Promise<Record<string, unknown> | null> {
  const org = await sharedPrisma.organization.findUnique({
    where: { id: orgId },
    include: { plan: true },
  });
  if (!org) return null;

  const settings = (org.settings ?? {}) as Record<string, unknown>;
  const modulesEnabled = (settings.modulesEnabled as string[] | undefined) ?? [];

  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    status: org.status,
    logo: org.logo ?? null,
    templateCode: org.templateCode ?? null,
    createdAt: org.createdAt.toISOString(),
    plan: org.plan
      ? {
          id: org.plan.id,
          code: org.plan.code,
          nameAr: org.plan.nameAr,
          nameEn: org.plan.nameEn,
          priceMonthlyMinor: org.plan.priceMonthlyMinor.toString(),
          currency: org.plan.currency,
          limits: org.plan.limits,
        }
      : null,
    settings: {
      ...settings,
      modulesEnabled,
    },
    branding: extractBranding(settings),
    modules: {
      enabled: modulesEnabled,
      count: modulesEnabled.length,
    },
  };
}

/** Branding lives inside `settings`; keep it a separate block for readability. */
function extractBranding(settings: Record<string, unknown>): Record<string, unknown> {
  const keys = ["primaryColor", "secondaryColor", "accentColor", "logo", "fontFamily", "receipt", "currency", "theme"];
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (settings[key] !== undefined) out[key] = settings[key];
  }
  return out;
}

/** Installed systems + the runtime endpoint each one resolves to. */
export async function buildSystemsManifest(orgId: string): Promise<Record<string, unknown>> {
  const installed = await sharedPrisma.organizationApp.findMany({
    where: { organizationId: orgId },
    include: { app: true },
    orderBy: { createdAt: "asc" },
  });
  const requests = await sharedPrisma.organizationAppRequest.findMany({
    where: { organizationId: orgId },
    include: { app: { select: { slug: true, name: true, nameAr: true } } },
    orderBy: { createdAt: "desc" },
  });

  const sourceSlugs = listSystemSources();

  return {
    generatedAt: new Date().toISOString(),
    installed: installed.map((link) => {
      const route = openRouteForSystem(link.app.slug, sourceSlugs);
      return {
        slug: link.app.slug,
        name: link.app.name,
        nameAr: link.app.nameAr,
        description: link.app.description,
        category: link.app.category,
        version: link.version,
        installStatus: link.status,
        kind: systemKind(link.app.slug, sourceSlugs),
        route: route.route,
        routePrefix: link.app.routePrefix,
        isRealSystem: servesPerOrg(link.app.slug, sourceSlugs),
        schemaKey: link.app.schemaKey ?? null,
        capabilities: link.app.capabilities,
        configuration: link.configuration ?? null,
        settings: link.settings ?? null,
        installedAt: link.installedAt.toISOString(),
        activatedAt: link.activatedAt?.toISOString() ?? null,
      };
    }),
    pendingRequests: requests.map((request) => ({
      id: request.id,
      appId: request.appId,
      appSlug: request.app.slug,
      appName: request.app.nameAr ?? request.app.name,
      status: request.status,
      planCode: request.planCode,
      note: request.note ?? null,
      decidedAt: request.decidedAt?.toISOString() ?? null,
      createdAt: request.createdAt.toISOString(),
    })),
    counts: {
      installed: installed.length,
      pending: requests.filter((r) => r.status === "pending").length,
      real: installed.filter((link) => servesPerOrg(link.app.slug, sourceSlugs)).length,
    },
  };
}

/** Members with their org role and the profile fields that matter org-side. */
export async function buildMembersManifest(orgId: string): Promise<Record<string, unknown>> {
  const members = await sharedPrisma.member.findMany({
    where: { organizationId: orgId },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });

  return {
    generatedAt: new Date().toISOString(),
    members: members.map((member) => ({
      id: member.id,
      role: member.role,
      joinedAt: member.createdAt.toISOString(),
      user: {
        id: member.user.id,
        name: member.user.name,
        email: member.user.email,
        phone: member.user.phone,
        countryCode: member.user.countryCode,
        username: member.user.username,
        image: member.user.image,
        coverImage: member.user.coverImage,
        bio: member.user.bio,
        locale: member.user.locale,
        createdAt: member.user.createdAt.toISOString(),
        emailVerified: member.user.emailVerified,
      },
    })),
    counts: {
      total: members.length,
      owners: members.filter((m) => m.role === "owner").length,
      admins: members.filter((m) => m.role === "admin").length,
    },
  };
}

export interface ManifestOptions {
  /** Row counts per tenant table, read from the org's own cluster. */
  tableCounts?: Record<string, number>;
  /** Extra per-section notes merged into `manifest.json`. */
  extra?: Record<string, unknown>;
}

/** `manifest.json` — the inventory of the folder and its provisioning state. */
export async function buildManifest(
  entry: VaultEntry,
  paths: OrgVaultPaths,
  options: ManifestOptions = {},
): Promise<Record<string, unknown>> {
  const profile = (await buildOrgProfile(entry.orgId)) ?? { slug: entry.slug };
  const systems = await buildSystemsManifest(entry.orgId);
  const members = await buildMembersManifest(entry.orgId);

  const counts = options.tableCounts ?? {};
  const rowsTotal = Object.values(counts).reduce((sum, n) => sum + n, 0);

  return {
    version: 2,
    generatedAt: new Date().toISOString(),
    organization: {
      id: entry.orgId,
      slug: entry.slug,
      name: profile.name ?? null,
      status: profile.status ?? null,
      plan: (profile.plan as { code?: string } | null)?.code ?? null,
    },
    vault: {
      root: paths.root,
      folder: entry.folder,
      sizeBytes: pathSize(paths.root), // recorded at provisioning time (not live folder walk)
    },
    // The org is a schema in the shared server. Its portable copy is the .sql
    // file, written on sign-out and loaded back when the org is opened.
    database: {
      kind: "schema-in-shared-server",
      schema: entry.schemaName,
      grocerySchema: entry.grocerySchemaName,
      sqlFile: paths.sqlFile,
      lastExportedAt: entry.lastExportedAt,
      lastError: entry.lastError,
    },
    contents: {
      org: "org.json",
      systems: "systems.json",
      members: "members.json",
      readme: "README.md",
      connection: "database/connection.json",
      sql: `database/${entry.folder}.sql`,
      backups: "database/backups/",
      data: "data/",
      files: "files/",
      logs: ["logs/app.log", "logs/audit.log", "logs/provisioning.log"],
    },
    data: {
      tablesWithRows: Object.entries(counts)
        .filter(([, n]) => n > 0)
        .map(([table, n]) => ({ table, rows: n })),
      rowsTotal,
    },
    systems,
    members: { counts: members.counts },
    ...options.extra,
  };
}

/** `database/connection.json` — where this org's data lives and how to move it. */
export function writeConnectionFile(entry: VaultEntry, paths: OrgVaultPaths): void {
  // The shared URL is written with its password masked: the file is meant to be
  // readable and copyable, not a credential store.
  const shared = process.env.DATABASE_URL?.replace(/:[^:@/]*@/, ":***@") ?? null;
  writeJsonFile(paths.connectionJson, {
    slug: entry.slug,
    organizationId: entry.orgId,
    database: {
      // Two different things live in two different places, and this file used to
      // name only the first while claiming to describe the whole org. An operator
      // reading it concluded a grocery product had to appear in `t_gm`, and went
      // looking for it in a schema no system ever writes to.
      kind: "schema-in-shared-server",
      schema: entry.schemaName,
      grocerySchema: entry.grocerySchemaName,
      sharedDatabaseUrl: shared,
    },
    // The installed systems do NOT live in the schema above. Each one runs
    // against a database of its own on the same server, named after the vault
    // folder, and that is where its tables and rows are.
    systemDatabase: {
      kind: "database-per-org",
      name: entry.databaseName,
      note: "Business systems installed for this org store all of their data here.",
    },
    sql: {
      file: paths.sqlFile,
      lastExportedAt: entry.lastExportedAt,
    },
    notes: [
      `The ERP tenant data for this org is the schema "${entry.schemaName}" inside the shared PostgreSQL server.`,
      `Business systems installed for this org use the separate database "${entry.databaseName}" on the same server. Products, customers and sales live there, not in the schema above.`,
      "There is no per-org PostgreSQL server and no per-org port: every database is on the one shared server.",
      "The org's ERP data is exported as one portable file: database/<folder>.sql, written on sign-out.",
      `Restore it with: psql -d <database> -f "${paths.sqlFile}"`,
    ],
    writtenAt: new Date().toISOString(),
  });
}

/** `README.md` — the human-readable entry point for the folder. */
function writeReadme(
  entry: VaultEntry,
  paths: OrgVaultPaths,
  profile: Record<string, unknown> | null,
  systems: Record<string, unknown>,
  members: Record<string, unknown>,
  manifest: Record<string, unknown>,
): void {
  writeFileSync(paths.readme, renderReadme(entry, paths, profile, systems, members, manifest), "utf-8");
}

export interface SyncResult {
  entry: VaultEntry;
  paths: OrgVaultPaths;
  manifest: Record<string, unknown>;
}

/**
 * Refreshes every manifest in an org's folder. Idempotent and safe to re-run;
 * does not touch the cluster.
 */
export async function syncOrgVaultFiles(slug: string, options: ManifestOptions = {}): Promise<SyncResult> {
  const entry = getVaultEntry(slug);
  if (!entry) throw new Error(`[org-vault] organization "${slug}" has no vault folder`);
  const paths = ensureOrgVaultDirs(orgVaultPaths(entry.folder));

  const profile = await buildOrgProfile(entry.orgId);
  const systems = await buildSystemsManifest(entry.orgId);
  const members = await buildMembersManifest(entry.orgId);
  const manifest = await buildManifest(entry, paths, options);

  writeJsonFile(paths.orgJson, profile ?? { slug: entry.slug, note: "organization not found" });
  writeJsonFile(paths.systemsJson, systems);
  writeJsonFile(paths.membersJson, members);
  writeJsonFile(paths.manifestJson, manifest);
  writeConnectionFile(entry, paths);
  writeReadme(entry, paths, profile, systems, members, manifest);

  appendJsonLine(paths.provisioningLog, {
    ts: new Date().toISOString(),
    slug,
    event: "manifests.synced",
    rowsTotal: (manifest.data as { rowsTotal: number }).rowsTotal,
  });

  return { entry, paths, manifest };
}

function renderReadme(
  entry: VaultEntry,
  paths: OrgVaultPaths,
  profile: Record<string, unknown> | null,
  systems: Record<string, unknown>,
  members: Record<string, unknown>,
  manifest: Record<string, unknown>,
): string {
  const database = manifest.database as Record<string, unknown>;
  const data = manifest.data as { rowsTotal: number; tablesWithRows: { table: string; rows: number }[] };
  const installed = (systems.installed as Record<string, unknown>[]) ?? [];
  const people = (members.members as Record<string, unknown>[]) ?? [];
  const planCode = (profile?.plan as { code?: string } | null)?.code ?? "none";
  const modules = (profile?.modules as { enabled?: string[] } | undefined)?.enabled ?? [];

  const lines: string[] = [];
  lines.push(`# ${String(profile?.name ?? entry.slug)}`);
  lines.push("");
  lines.push(`Organization vault for slug \`${entry.slug}\` (id \`${entry.orgId}\`).`);
  lines.push("Everything the platform holds for this organization lives in this folder.");
  lines.push("");
  lines.push("## Profile");
  lines.push("");
  lines.push("| Field | Value |");
  lines.push("|---|---|");
  lines.push(`| Name | ${String(profile?.name ?? "-")} |`);
  lines.push(`| Slug | \`${entry.slug}\` |`);
  lines.push(`| Status | ${String(profile?.status ?? "-")} |`);
  lines.push(`| Plan | ${planCode} |`);
  lines.push(`| Template | ${String(profile?.templateCode ?? "none")} |`);
  lines.push(`| Created | ${String(profile?.createdAt ?? "-")} |`);
  lines.push("");
  lines.push(`**Modules enabled (${modules.length}):** ${modules.length ? modules.join(", ") : "_none_"}`);
  lines.push("");

  lines.push("## Systems");
  lines.push("");
  if (installed.length === 0) {
    lines.push("_No systems installed._");
  } else {
    lines.push("| System | Slug | Version | Status | Kind | Route |");
    lines.push("|---|---|---|---|---|---|");
    for (const system of installed) {
      const route = system.route ? `\`${String(system.route)}\`` : "-";
      lines.push(
        `| ${String(system.nameAr ?? system.name)} | \`${String(system.slug)}\` | ${String(system.version)} | ` +
          `${String(system.installStatus)} | ${String(system.kind)} | ${route} |`,
      );
    }
  }
  lines.push("");

  lines.push("## People");
  lines.push("");
  if (people.length === 0) {
    lines.push("_No members._");
  } else {
    lines.push("| Name | Role | Contact |");
    lines.push("|---|---|---|");
    for (const person of people) {
      const user = person.user as Record<string, unknown>;
      const contact = [user.email, user.phone].filter(Boolean).join(" / ") || "-";
      lines.push(`| ${String(user.name)} | ${String(person.role)} | ${contact} |`);
    }
  }
  lines.push("");

  lines.push("## Database (one SQL file)");
  lines.push("");
  lines.push(`- Schema in the shared server: \`${String(database.schema)}\``);
  lines.push(`- The whole database as one portable file: \`database/${entry.folder}.sql\``);
  lines.push(`- Rows in this org's tables: **${data.rowsTotal}**`);
  if (data.tablesWithRows.length > 0) {
    lines.push(`- Non-empty tables: ${data.tablesWithRows.map((t) => `\`${t.table}\` (${t.rows})`).join(", ")}`);
  }
  lines.push("- Written on sign-out (and by the in-app autosave); loaded back when the org is opened.");
  lines.push(`- Last export: ${database.lastExportedAt ? String(database.lastExportedAt) : "never"}`);
  lines.push("- Restore with: `psql -d <database> -f database/" + entry.folder + ".sql`");
  lines.push("- Details: `database/connection.json`");
  lines.push("");

  lines.push("## Folder layout");
  lines.push("");
  lines.push("```text");
  lines.push(`${paths.folder}/`);
  lines.push("  org.json                 profile: name, plan, status, settings, branding, modules");
  lines.push("  systems.json             installed systems, pending requests, routes");
  lines.push("  members.json             members, roles and org-scoped profile data");
  lines.push("  manifest.json            inventory, provisioning state, row counts");
  lines.push("  README.md                this file");
  lines.push("  database/");
  lines.push(`    ${entry.folder}.sql           the whole database as one portable SQL file`);
  lines.push("    connection.json        schema name and restore instructions");
  lines.push("    backups/               dated snapshots of the same schema");
  lines.push("  data/                    data exports by domain (JSON + CSV)");
  lines.push("  files/                   uploaded files, media, generated exports, imports");
  lines.push("  logs/                    app.log, audit.log, provisioning.log");
  lines.push("```");
  lines.push("");

  lines.push("## Operations");
  lines.push("");
  lines.push("```powershell");
  lines.push(`npx tsx scripts/org-vault.ts export  --slug ${entry.slug}`);
  lines.push(`npx tsx scripts/org-vault.ts import  --slug ${entry.slug}`);
  lines.push(`npx tsx scripts/org-vault.ts open    --slug ${entry.slug}`);
  lines.push(`npx tsx scripts/org-vault.ts backup  --slug ${entry.slug}`);
  lines.push("```");
  lines.push("");
  lines.push(`_Generated ${String(manifest.generatedAt)}._`);
  lines.push("");
  return lines.join("\n");
}

export { openRouteForSlug };

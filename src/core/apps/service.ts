import { prisma } from "@/core/db/client";
import { ApiError } from "@/core/http/api";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  catalogAppSchema,
  DEMO_CATALOG_META,
  installState,
  openRouteForSlug,
  openRouteForOrgSlug,
  systemKind,
  type CatalogAppInput,
  type SystemKind,
} from "@/core/systems/catalog";
import { getSystemById } from "@/core/demo/systems-catalog";
import { cloneSystemForOrg, listSystemSources, type CloneResult } from "@/core/org-vault/system-clone";
import { hasSystemSource, systemContract } from "@/core/org-vault/system-sources";
import { getVaultEntry, upsertVaultEntry } from "@/core/org-vault/registry";
import { orgVaultPaths, readJsonFile } from "@/core/org-vault/paths";
import { orgSystemDir } from "@/core/org-vault/system-clone";
import { parseOrgSystemDisplayName, withOrgSystemDisplayName } from "./settings";
import type {
  AppMetadata,
  AppInstallStatus,
  OrganizationApp,
} from "./types";
import { installAppSchema } from "./types";
import type { organizationApp } from "@/core/db/generated/prisma/client";
import { writeAuditLog } from "@/core/audit/service";
import { logger } from "@/core/logging/logger";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyJson = any;

/**
 * Reduce app metadata to a JSON-serializable shape for the `app` registry row.
 * `aiTools[].parametersSchema` and `configurationSchema` hold live Zod schemas
 * (functions) which cannot be stored in a JSON column — they are re-derived at
 * runtime from the adapters via getAITools()/getSettingsSchema(), so we persist
 * only the metadata and omit the schema objects.
 */
export function sanitizeAiTools(tools: unknown): AnyJson | undefined {
  if (!Array.isArray(tools)) return undefined;
  return tools.map((tool) => {
    const { parametersSchema: _ps, ...rest } = (tool ?? {}) as Record<string, unknown>;
    void _ps;
    return rest;
  });
}

export function sanitizeConfigurationSchema(schema: unknown): AnyJson | undefined {
  if (schema === undefined || schema === null) return undefined;
  return JSON.parse(JSON.stringify(schema, (_k, v) => (typeof v === "function" ? undefined : v)));
}

// ── App Management Service ─────────────────────────────────────────────────
// Handles installing, activating, disabling, and querying applications
// for a specific organization. All operations are tenant-scoped.

/**
 * Get all apps installed by an organization.
 */
export async function getOrganizationApps(
  organizationId: string,
): Promise<OrganizationApp[]> {
  const rows = await prisma.organizationApp.findMany({
    where: { organizationId },
    orderBy: { installedAt: "desc" },
  });
  return rows.map(formatOrgApp);
}

/**
 * Get a specific installed app for an organization.
 */
export async function getOrganizationApp(
  organizationId: string,
  appId: string,
): Promise<OrganizationApp | null> {
  const row = await prisma.organizationApp.findUnique({
    where: { organizationId_appId: { organizationId, appId } },
  });
  return row ? formatOrgApp(row) : null;
}

/**
 * Check if an organization has a specific app installed and active.
 */
export async function isAppActive(
  organizationId: string,
  appSlug: string,
): Promise<boolean> {
  const app = await prisma.app.findUnique({ where: { slug: appSlug } });
  if (!app) return false;

  const orgApp = await prisma.organizationApp.findUnique({
    where: { organizationId_appId: { organizationId, appId: app.id } },
  });
  return orgApp?.status === "active";
}

/** Prisma's unique-constraint violation code (`P2002`), without importing the runtime. */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002";
}

/**
 * Writes the org's install row, tolerating a lost race.
 *
 * Two concurrent installs of the same system both pass the "already installed?"
 * read and then both `create`; one wins and the loser gets a Prisma `P2002`. The
 * loser must report the same settled state the winner produced, not a 500, so the
 * unique violation is caught and the winner's row is returned with `created:
 * false`. Any other error still propagates.
 */
async function createOrgAppRow(
  organizationId: string,
  appId: string,
  version: string,
  configuration?: AnyJson,
): Promise<{ row: organizationApp; created: boolean }> {
  try {
    const row = await prisma.organizationApp.create({
      data: {
        id: randomUUID(),
        organizationId,
        appId,
        status: "active",
        version,
        configuration: configuration ?? undefined,
        activatedAt: new Date(),
      },
    });
    return { row, created: true };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const existing = await prisma.organizationApp.findUnique({
      where: { organizationId_appId: { organizationId, appId } },
    });
    if (!existing) throw err;
    return { row: existing, created: false };
  }
}

/**
 * Install an application for an organization.
 * Validates the app exists, isn't already installed, and applies default config.
 *
 * A successful install also gives the org its own private copy of the system:
 * `system/<slug>/` is cloned into `orginazition/<org>/systems/<slug>/`. The
 * clone is best-effort and never fails the install — a missing source folder is
 * a normal state (most catalog systems are in-shell modules, not source trees),
 * not an error.
 */
export async function installApp(
  organizationId: string,
  input: { appId: string; configuration?: Record<string, unknown> },
): Promise<OrganizationApp> {
  const parsed = installAppSchema.parse(input);

  // Verify app exists in registry
  const app = await prisma.app.findUnique({ where: { id: parsed.appId } });
  if (!app) {
    throw ApiError.notFound("Application not found");
  }
  if (!app.isActive) {
    throw ApiError.badRequest("Application is not available");
  }

  // Check not already installed
  const existing = await prisma.organizationApp.findUnique({
    where: { organizationId_appId: { organizationId, appId: app.id } },
  });
  if (existing) {
    throw ApiError.badRequest("Application is already installed");
  }

  const { row: orgApp, created } = await createOrgAppRow(
    organizationId,
    app.id,
    app.version,
    (parsed.configuration as AnyJson) ?? undefined,
  );
  if (!created) {
    // Lost a concurrent-install race: the winner's row is the answer, not an
    // error, so a double-clicked Install costs a clone the winner already did.
    return formatOrgApp(orgApp);
  }

  await cloneInstalledSystem(organizationId, app.slug);

  return formatOrgApp(orgApp);
}

/**
 * Clones `system/<slug>/` into the org's vault folder, resolving the slug from
 * the `organizationApp` row so every caller (install, re-install repair,
 * backfill) shares one definition of "this org owns this system".
 */
export async function cloneInstalledSystem(organizationId: string, appSlug: string): Promise<CloneResult> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { slug: true },
  });
  if (!org) {
    return { cloned: false, fresh: false, path: "", files: 0, reason: "organization not found" };
  }
  return cloneSystemForOrg({ slug: org.slug }, appSlug);
}

/**
 * Clones by `organizationApp` id — the handle the profile page and the platform
 * admin both hold. Also the repair path: calling it for an org that already has
 * the system is a no-op thanks to the clone stamp.
 */
export async function cloneInstalledSystemByRow(organizationAppId: string): Promise<CloneResult> {
  const row = await prisma.organizationApp.findUnique({
    where: { id: organizationAppId },
    select: { organizationId: true, app: { select: { slug: true } } },
  });
  if (!row) {
    return { cloned: false, fresh: false, path: "", files: 0, reason: "install not found" };
  }
  return cloneInstalledSystem(row.organizationId, row.app.slug);
}

/**
 * Set (or clear) the org's own name for an installed system.
 *
 * The name rules live in `settings.ts` so the profile overview and this write
 * path cannot drift apart.
 */
export async function setOrgSystemDisplayName(
  organizationId: string,
  appId: string,
  displayName: string | null,
): Promise<{ displayName: string | null }> {
  const orgApp = await prisma.organizationApp.findUnique({
    where: { organizationId_appId: { organizationId, appId } },
  });
  if (!orgApp) throw ApiError.notFound("Application is not installed");

  let next: string | null;
  try {
    next = parseOrgSystemDisplayName(displayName ?? "");
  } catch (err) {
    throw ApiError.badRequest(err instanceof Error ? err.message : "Invalid name");
  }

  const settings = withOrgSystemDisplayName(orgApp.settings, next);

  await prisma.organizationApp.update({
    where: { id: orgApp.id },
    data: { settings: settings as AnyJson },
  });

  return { displayName: next };
}

export interface RequestSystemResult {
  /**
   * `pending` after a request is created or already waiting; `installed` when the
   * org already has the system, in which case no request exists or is created.
   */
  state: "pending" | "installed";
  /** The `organizationAppRequest` id, null when the system is already installed. */
  requestId: string | null;
  /** Where the customer lands if already installed (app routePrefix, demo fallback). */
  route: string | null;
  /** False when an identical pending request already existed (idempotent re-run). */
  created: boolean;
}

/**
 * Customer request to add a catalog system — ALWAYS creates a platform-approval
 * request, never an instant install (req: adding a system asks the platform
 * admin first). Safe to run multiple times:
 *  - already installed    → returned as installed, no request created;
 *  - already pending      → returned as-is (`created: false`, no duplicate);
 *  - previously rejected  → reopened to pending, so a retry lands in the queue.
 *
 * Disabled catalog systems (`isActive: false`) — the platform admin's global
 * kill-switch — and not-yet-built `soon` systems refuse the request outright.
 * The card hiding its button is presentation and not a control, so the guards
 * live in this one function every request funnels through.
 */
export async function requestSystemForTenant(
  organizationId: string,
  input: { slug: string; userId: string },
): Promise<RequestSystemResult> {
  const app = await prisma.app.findUnique({ where: { slug: input.slug } });
  if (!app) {
    throw ApiError.notFound("System not found");
  }
  if (!app.isActive) {
    throw ApiError.badRequest("This system has been disabled by the platform administrator");
  }
  if (getSystemById(app.slug)?.status === "soon") {
    throw ApiError.badRequest("This system is not available yet");
  }

  const existing = await prisma.organizationApp.findUnique({
    where: { organizationId_appId: { organizationId, appId: app.id } },
  });
  if (existing) {
    // The card the customer clicks after installing leads under the org, because
    // that is where the org's own copy of the system is mounted.
    const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { slug: true } });
    const route = openRouteForOrgSlug(app.slug, org?.slug, listSystemSources());
    return { state: "installed", requestId: null, route, created: false };
  }

  const pending = await prisma.organizationAppRequest.findFirst({
    where: { organizationId, appId: app.id, status: "pending" },
  });
  if (pending) {
    return { state: "pending", requestId: pending.id, route: null, created: false };
  }

  // A rejected request is reopened rather than shadowed by a duplicate row, so
  // the approvals queue keeps one entry per system and history is preserved.
  const rejected = await prisma.organizationAppRequest.findFirst({
    where: { organizationId, appId: app.id, status: "rejected" },
  });

  const row = rejected
    ? await prisma.organizationAppRequest.update({
        where: { id: rejected.id },
        data: { status: "pending", decidedByUserId: null, decidedAt: null, rejectReason: null },
        select: { id: true },
      })
    : await prisma.organizationAppRequest.create({
        data: {
          id: randomUUID(),
          organizationId,
          appId: app.id,
          requestedByUserId: input.userId,
          status: "pending",
        },
        select: { id: true },
      });

  await writeAuditLog(
    prisma,
    { organizationId, userId: input.userId },
    { action: "marketplace.app.requested", entityType: "app", entityId: app.id },
  );

  return { state: "pending", requestId: row.id, route: null, created: true };
}

export interface WithdrawSystemRequestResult {
  /** True when a pending request existed and was removed. */
  withdrawn: boolean;
  /** Always null today; present so the card can treat both request paths alike. */
  route: string | null;
}

/**
 * A member withdraws their organization's pending request for a system.
 *
 * The approvals queue only shrinks when an admin decides, so a customer who
 * changed their mind had no way to say so. The pending row is deleted rather
 * than marked: `@@unique([organizationId, appId])` allows exactly one request
 * per system, so a leftover row would shadow the next request, and the audit
 * log is what preserves the history. Refused when nothing is pending — an
 * already-installed system has nothing to withdraw.
 */
export async function withdrawSystemRequest(
  organizationId: string,
  input: { slug: string; userId: string },
): Promise<WithdrawSystemRequestResult> {
  const app = await prisma.app.findUnique({ where: { slug: input.slug } });
  if (!app) {
    throw ApiError.notFound("System not found");
  }

  const pending = await prisma.organizationAppRequest.findFirst({
    where: { organizationId, appId: app.id, status: "pending" },
    select: { id: true },
  });
  if (!pending) {
    throw ApiError.notFound("There is no pending request to withdraw");
  }

  await prisma.organizationAppRequest.delete({ where: { id: pending.id } });

  await writeAuditLog(
    prisma,
    { organizationId, userId: input.userId },
    { action: "marketplace.app.withdrawn", entityType: "app", entityId: app.id },
  );

  return { withdrawn: true, route: null };
}

/**
 * True when this org's own copy of a system has never been built.
 *
 * The install gives the org a folder of source; the build that turns it into a
 * running app happens on first open and takes minutes. The marketplace needs to
 * tell those two apart, because "Open" on a folder with no build in it is a
 * promise the platform cannot keep inside a page load.
 *
 * Deliberately cheap and deliberately not exact. The supervisor's own answer
 * (`isBuildCurrent`) also compares a hash of the source, so an org that edits
 * their system would flip this to true again and send the card back to
 * "preparing" for a build the supervisor would in fact reuse. Existence of the
 * runtime state file is the question the card is really asking — has this copy
 * ever run — and that is what this answers.
 */
export function orgSystemNeedsBuild(orgSlug: string, systemSlug: string): boolean {
  const entry = getVaultEntry(orgSlug);
  const folder = entry?.folder ?? orgSlug;
  const state = readJsonFile<unknown>(join(orgSystemDir(orgVaultPaths(folder), systemSlug), ".runtime.json"), null);
  return state === null;
}

export interface InstallSystemResult {
  /**
   * `preparing` when the org's copy was just cloned and has not been built,
   * `installed` when it is runnable now, `pending` when the platform has no
   * runnable source for the slug and the call was queued as a request instead.
   */
  state: "preparing" | "installed" | "pending";
  /** The `organizationAppRequest` id — non-null only on the `pending` path. */
  requestId: string | null;
  /** Where the customer's own copy of the system will be served. */
  route: string | null;
  /** False when this call changed nothing (already installed, or already queued). */
  created: boolean;
}

/**
 * An organization adds a system to itself.
 *
 * Two outcomes, decided by a fact on disk rather than by a flag:
 *
 *  - the platform has a **runnable source** for the slug (`system/<slug>/`
 *    satisfying the whole contract in `systemContract`) — the org gets its own
 *    private copy of the code, its own database and its own process, mounted at
 *    `/{org}/{system}`, immediately. This is the mechanism an admin's approval
 *    runs; the human decision was already made in the approvals queue, so the
 *    function itself decides nothing.
 *  - it does not — there is no code to hand over, so the request goes to the
 *    platform approval queue exactly as before. This is the correct answer for
 *    the eight catalog systems whose sources are not in this repo, and faking an
 *    install for them would produce an org that believes it owns an app and gets
 *    a 502.
 *
 * The two are mutually exclusive by construction: the clone is the install. If
 * the copy cannot be written the install row is rolled back, because an org
 * holding an install it cannot open is worse than one that was told to wait.
 *
 * Idempotent, like the request path: a re-run on an installed system reports
 * `installed` and touches nothing, which is what makes it safe for the card to
 * retry and for a double-click to cost nothing.
 */
export async function installSystemForOrg(
  organizationId: string,
  input: { slug: string; userId: string },
): Promise<InstallSystemResult> {
  const app = await prisma.app.findUnique({ where: { slug: input.slug } });
  if (!app) {
    throw ApiError.notFound("System not found");
  }
  if (!app.isActive) {
    throw ApiError.badRequest("This system has been disabled by the platform administrator");
  }
  if (getSystemById(app.slug)?.status === "soon") {
    throw ApiError.badRequest("This system is not available yet");
  }

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { slug: true },
  });
  if (!org) {
    throw ApiError.notFound("Organization not found");
  }

  // Both outcomes lead under the org that asked, because that is where its own
  // copy is mounted either way.
  const route = openRouteForOrgSlug(app.slug, org.slug, listSystemSources());

  const existing = await prisma.organizationApp.findUnique({
    where: { organizationId_appId: { organizationId, appId: app.id } },
  });
  if (existing) {
    return {
      state: orgSystemNeedsBuild(org.slug, app.slug) ? "preparing" : "installed",
      requestId: null,
      route,
      created: false,
    };
  }

  // No runnable source: nothing to install, so this is a request.
  if (!hasSystemSource(app.slug) || systemContract(app.slug).missing.length > 0) {
    return requestSystemForTenant(organizationId, input);
  }

  // The org needs a registry entry before a copy of anything can be served: the
  // entry is what maps its slug to the folder the copy lands in, and the proxy
  // answers 409 without one. Every org created through the normal paths is
  // scaffolded and has one, but this install must not *depend* on that having
  // happened — an org whose folder creation was skipped or failed would
  // otherwise end up owning an installed system it could never open, with no way
  // back short of the platform console.
  await upsertVaultEntry({ slug: org.slug, orgId: organizationId });

  const { row, created } = await createOrgAppRow(organizationId, app.id, app.version);
  if (!created) {
    // A concurrent install won the race. Report the settled state, not a 500 —
    // a double-clicked Install button is a normal occurrence, not an error.
    return {
      state: orgSystemNeedsBuild(org.slug, app.slug) ? "preparing" : "installed",
      requestId: null,
      route,
      created: false,
    };
  }

  const clone = await cloneInstalledSystem(organizationId, app.slug);
  if (!clone.cloned) {
    // The install and the copy are one thing. Leaving the row behind would tell
    // the org it owns a system whose files are not there, and every later open
    // would be a 500 with no way back short of the platform console.
    await prisma.organizationApp.delete({ where: { id: row.id } }).catch(() => undefined);
    logger.error(
      { organizationId, appSlug: app.slug, reason: clone.reason },
      "[apps] install rolled back: system could not be copied into the org",
    );
    throw ApiError.badRequest("This system could not be installed for your organization");
  }

  await writeAuditLog(
    prisma,
    { organizationId, userId: input.userId },
    { action: "marketplace.app.installed", entityType: "app", entityId: app.id },
  );

  return {
    state: orgSystemNeedsBuild(org.slug, app.slug) ? "preparing" : "installed",
    requestId: null,
    route,
    created: true,
  };
}

/**
 * Update an installed app's status (activate, disable, suspend).
 */
export async function updateAppStatus(
  organizationId: string,
  appId: string,
  status: AppInstallStatus,
): Promise<OrganizationApp> {
  const orgApp = await prisma.organizationApp.findUnique({
    where: { organizationId_appId: { organizationId, appId } },
  });
  if (!orgApp) {
    throw ApiError.notFound("Application is not installed");
  }

  const updateData: Record<string, unknown> = { status };
  if (status === "active") updateData.activatedAt = new Date();
  if (status === "disabled") updateData.disabledAt = new Date();

  const updated = await prisma.organizationApp.update({
    where: { id: orgApp.id },
    data: updateData,
  });

  return formatOrgApp(updated);
}

/**
 * Uninstall (disable + remove) an app from an organization.
 * Does NOT delete any app data — just removes access.
 */
export async function uninstallApp(
  organizationId: string,
  appId: string,
): Promise<void> {
  const orgApp = await prisma.organizationApp.findUnique({
    where: { organizationId_appId: { organizationId, appId } },
  });
  if (!orgApp) {
    throw ApiError.notFound("Application is not installed");
  }

  await prisma.organizationApp.delete({ where: { id: orgApp.id } });
}

/** What an uninstall did, and what it deliberately left in place. */
export interface UninstallSystemResult {
  /** True when a running process for the org's copy was stopped. */
  stopped: boolean;
  /** The org's cloned files are kept — an uninstall is not a data wipe. */
  filesKept: boolean;
  /** The org's private database is kept — re-installing reuses it. */
  databaseKept: boolean;
}

/**
 * Uninstall a system from an org: stop its runtime, then remove the install row.
 *
 * The old `uninstallApp` deleted the row and nothing else, so the org's Node
 * process kept running against a system it no longer owned. This stops the
 * process first so there is no window where a live runtime has no install behind
 * it, and it reports what it left on disk: the cloned files and the org's private
 * database are kept, so re-installing reattaches instead of rebuilding from
 * scratch. A destructive wipe would be a separate, explicit operation.
 *
 * `stop` is injectable so the decision can be tested without spawning processes.
 */
export async function uninstallSystemForOrg(
  organizationId: string,
  slug: string,
  stop?: (orgSlug: string, systemSlug: string) => boolean,
): Promise<UninstallSystemResult> {
  const app = await prisma.app.findUnique({ where: { slug }, select: { id: true } });
  if (!app) throw ApiError.notFound("Application not found");

  const orgApp = await prisma.organizationApp.findUnique({
    where: { organizationId_appId: { organizationId, appId: app.id } },
    select: { id: true },
  });
  if (!orgApp) throw ApiError.notFound("Application is not installed");

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { slug: true },
  });

  // Imported lazily: the supervisor pulls in `node:child_process`, which has no
  // business in every module that reads the marketplace catalog.
  const stopRuntime =
    stop ?? (await import("@/core/systems/runtime/supervisor")).stopOrgRuntime;
  const stopped = org ? stopRuntime(org.slug, slug) : false;

  await prisma.organizationApp.delete({ where: { id: orgApp.id } });

  return { stopped, filesKept: true, databaseKept: true };
}

/**
 * Update an installed app's configuration.
 */
export async function updateAppConfiguration(
  organizationId: string,
  appId: string,
  configuration: Record<string, unknown>,
): Promise<OrganizationApp> {
  const orgApp = await prisma.organizationApp.findUnique({
    where: { organizationId_appId: { organizationId, appId } },
  });
  if (!orgApp) {
    throw ApiError.notFound("Application is not installed");
  }

  const updated = await prisma.organizationApp.update({
    where: { id: orgApp.id },
    data: { configuration: configuration as AnyJson },
  });

  return formatOrgApp(updated);
}

/**
 * Get all available apps from the registry (for marketplace display).
 * Cross-references with what the organization already has installed.
 */
export async function getAvailableApps(organizationId: string) {
  const allApps = await prisma.app.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
  });

  const installed = await prisma.organizationApp.findMany({
    where: { organizationId },
  });

  const installedMap = new Map(installed.map((ia) => [ia.appId, ia.status]));

  return allApps.map((app) => ({
    ...app,
    installStatus: installedMap.get(app.id) ?? null,
  }));
}

/**
 * Seed a set of apps into the registry (platform admin operation).
 */
export async function registerAppsInDb(
  apps: AppMetadata[],
): Promise<void> {
  for (const meta of apps) {
    await prisma.app.upsert({
      where: { slug: meta.slug },
      create: {
        slug: meta.slug,
        name: meta.name,
        nameAr: meta.nameAr,
        description: meta.description,
        descriptionAr: meta.descriptionAr,
        icon: meta.icon,
        category: meta.category,
        version: meta.version,
        routePrefix: meta.routePrefix,
        capabilities: meta.capabilities as AnyJson,
        permissions: meta.permissions as AnyJson,
        navigation: meta.navigation as AnyJson,
        configurationSchema: sanitizeConfigurationSchema(meta.configurationSchema),
        dashboardWidgets: (meta.dashboardWidgets as AnyJson) ?? undefined,
        aiTools: sanitizeAiTools(meta.aiTools),
      },
      update: {
        name: meta.name,
        nameAr: meta.nameAr,
        description: meta.description,
        descriptionAr: meta.descriptionAr,
        icon: meta.icon,
        version: meta.version,
        capabilities: meta.capabilities as AnyJson,
        permissions: meta.permissions as AnyJson,
        navigation: meta.navigation as AnyJson,
      },
    });
  }
}

// ── System Catalog (platform-wide) ─────────────────────────────────────────
// Powers BOTH the admin "systems" manager (/platform-admin/systems) and the
// customer marketplace (/apps). The `app` registry table is the single dynamic
// catalog — marketable systems are added here, never hard-coded in a page.

export interface CatalogEntry {
  id: string;
  slug: string;
  name: string;
  nameAr: string | null;
  description: string | null;
  descriptionAr: string | null;
  icon: string | null;
  image: string | null;
  schemaKey: string | null;
  category: string;
  version: string | null;
  routePrefix: string | null;
  status: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  kind: SystemKind;
  route: string | null;
  installCount: number;
  requestCount: number;
}

function toCatalogEntry(
  row: {
    id: string;
    slug: string;
    name: string;
    nameAr: string | null;
    description: string | null;
    descriptionAr: string | null;
    icon: string | null;
    image: string | null;
    schemaKey: string | null;
    category: string;
    version: string | null;
    routePrefix: string | null;
    status: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  },
  installCount: number,
  requestCount: number,
  sourceSlugs: readonly string[] = [],
): CatalogEntry {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    nameAr: row.nameAr,
    description: row.description,
    descriptionAr: row.descriptionAr,
    icon: row.icon,
    image: row.image,
    schemaKey: row.schemaKey,
    category: row.category,
    version: row.version,
    routePrefix: row.routePrefix,
    status: row.status,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    kind: systemKind(row.slug, sourceSlugs),
    route: openRouteForSlug(row.slug),
    installCount,
    requestCount,
  };
}

/** Full catalog for the platform admin: every app + usage counters. */
export async function getAppCatalog(): Promise<CatalogEntry[]> {
  const rows = await prisma.app.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  const [installs, requests] = await Promise.all([
    prisma.organizationApp.groupBy({
      by: ["appId"],
      where: { status: "active" },
      _count: { appId: true },
    }),
    prisma.organizationAppRequest.groupBy({
      by: ["appId"],
      where: { status: "pending" },
      _count: { appId: true },
    }),
  ]);

  const installsMap = new Map(installs.map((r) => [r.appId, r._count.appId] as const));
  const requestsMap = new Map(requests.map((r) => [r.appId, r._count.appId] as const));
  const sourceSlugs = listSystemSources();

  return rows.map((row) =>
    toCatalogEntry(row, installsMap.get(row.id) ?? 0, requestsMap.get(row.id) ?? 0, sourceSlugs),
  );
}

/** Admin create/update of a catalog entry (shared schema with /apps). */
export async function upsertCatalogApp(input: CatalogAppInput): Promise<CatalogEntry> {
  const data = catalogAppSchema.parse(input);

  const row = await prisma.app.upsert({
    where: { slug: data.slug },
    create: {
      slug: data.slug,
      name: data.name,
      nameAr: data.nameAr,
      description: data.description,
      descriptionAr: data.descriptionAr,
      icon: data.icon,
      category: data.category,
      version: data.version,
      routePrefix: data.routePrefix,
      isActive: data.isActive ?? true,
      status: data.status ?? "active",
      image: data.image || undefined,
      schemaKey: data.schemaKey || undefined,
    },
    update: {
      name: data.name,
      nameAr: data.nameAr,
      description: data.description,
      descriptionAr: data.descriptionAr,
      icon: data.icon,
      category: data.category,
      version: data.version,
      routePrefix: data.routePrefix,
      image: data.image || undefined,
      schemaKey: data.schemaKey || undefined,
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
    },
  });

  return toCatalogEntry(row, 0, 0, listSystemSources());
}

/** Admin availability toggle (isActive / status) — guarded against last real removal. */
export async function updateCatalogApp(
  slug: string,
  patch: { isActive?: boolean; status?: string; image?: string; schemaKey?: string },
): Promise<CatalogEntry | null> {
  const row = await prisma.app.findUnique({ where: { slug } });
  if (!row) return null;

  const updated = await prisma.app.update({
    where: { slug },
    data: {
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.image !== undefined ? { image: patch.image || null } : {}),
      ...(patch.schemaKey !== undefined ? { schemaKey: patch.schemaKey || null } : {}),
    },
  });

  const installCount = await prisma.organizationApp.count({
    where: { appId: updated.id, status: "active" },
  });
  const requestCount = await prisma.organizationAppRequest.count({
    where: { appId: updated.id, status: "pending" },
  });
  return toCatalogEntry(updated, installCount, requestCount, listSystemSources());
}

/** Admin delete — refused while any org has it installed or requested. */
export async function deleteCatalogApp(slug: string): Promise<{ deleted: boolean }> {
  const row = await prisma.app.findUnique({ where: { slug } });
  if (!row) return { deleted: false };

  const [installed, requested] = await Promise.all([
    prisma.organizationApp.count({ where: { appId: row.id } }),
    prisma.organizationAppRequest.count({ where: { appId: row.id } }),
  ]);
  if (installed > 0 || requested > 0) {
    throw ApiError.conflict(`System is referenced by ${installed + requested} tenant install/request(s)`);
  }

  await prisma.app.delete({ where: { id: row.id } });
  return { deleted: true };
}

/** Idempotently seed the demo systems into the catalog (platform seed). */
export async function seedDemoCatalog(): Promise<number> {
  let count = 0;
  for (const meta of DEMO_CATALOG_META) {
    await prisma.app.upsert({
      where: { slug: meta.slug },
      create: {
        slug: meta.slug,
        name: meta.name,
        nameAr: meta.nameAr,
        description: meta.description,
        descriptionAr: meta.descriptionAr,
        icon: meta.icon,
        category: meta.category,
        version: meta.version,
      routePrefix: meta.routePrefix,
      isActive: true,
      status: "active",
      image: undefined,
      schemaKey: undefined,
    },
    update: {
        name: meta.name,
        nameAr: meta.nameAr,
        description: meta.description,
        descriptionAr: meta.descriptionAr,
        icon: meta.icon,
        category: meta.category,
        version: meta.version,
        routePrefix: meta.routePrefix,
      },
    });
    count += 1;
  }
  return count;
}

// ── Customer Marketplace ────────────────────────────────────────────────────
// Per-tenant view of the catalog with install/pending/favorite state.

export interface MarketplaceEntry extends Omit<CatalogEntry, "installCount" | "requestCount"> {
  state: ReturnType<typeof installState>;
  isFavorite: boolean;
}

export async function getCustomerMarketplace(
  organizationId: string,
  userId: string,
): Promise<MarketplaceEntry[]> {
  const [rows, installed, requests, favorites, org] = await Promise.all([
    prisma.app.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }] }),
    prisma.organizationApp.findMany({ where: { organizationId } }),
    prisma.organizationAppRequest.findMany({ where: { organizationId, status: "pending" } }),
    prisma.pinnedApp.findMany({ where: { userId } }),
    prisma.organization.findUnique({ where: { id: organizationId }, select: { slug: true } }),
  ]);

  const installedMap = new Map(installed.map((r) => [r.appId, true] as const));
  const requestMap = new Map(requests.map((r) => [r.appId, true] as const));
  const favMap = new Map(favorites.map((r) => [r.appId, true] as const));
  // One `readdirSync` for the whole catalog, not one per row.
  const sourceSlugs = listSystemSources();

  return rows.map((row) => {
    // `kind` is per-row, but the answer depends on one fact about the deployment
    // that is the same for every row: which systems it can clone and serve per
    // org. Read it once so a 200-row catalog does not stat the disk 200 times.
    const kind = systemKind(row.slug, sourceSlugs);
    // The curated catalog is the source of truth for "coming soon", read by slug
    // so a system that becomes available needs no re-seed of a stored flag.
    const soon = getSystemById(row.slug)?.status === "soon";
    const installed = installedMap.get(row.id) === true;
    // An install whose pristine source was removed can no longer be served:
    // `/{org}/{system}` checks `listSystemSources()` and 404s. Report it as
    // unavailable and drop the route rather than offer a link that cannot work.
    const sourceMissing = installed && !sourceSlugs.includes(row.slug);
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      nameAr: row.nameAr,
      description: row.description,
      descriptionAr: row.descriptionAr,
      icon: row.icon,
      image: row.image,
      schemaKey: row.schemaKey,
      category: row.category,
      version: row.version,
      routePrefix: row.routePrefix,
      status: row.status,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      kind,
      // A real system opens under the org that installed it, because that is
      // where its own process is mounted. Everything else falls back: a row's own
      // routePrefix wins over the slug lookup, because `openRouteForSlug` only
      // knows the in-shell modules and the demo keys, so a catalog system seeded
      // with its real route (`pharmacy-management` -> /pharmacy) resolved to null
      // and the card offered no way in until it was installed.
      //
      // Nulled outright when the org has NOT installed it. `openRouteForOrgSlug`
      // is happy to hand back `/{org}/{system}` for a system this org does not
      // own, and the proxy answers that with 403 — so a card for an uninstalled
      // app would carry a link that is guaranteed to fail. The route is what the
      // "Open" button and the recently-opened chips navigate to, so it must only
      // ever name a system this org actually has.
      route:
        installed && sourceMissing
          ? null
          : kind === "real" && !installed
            ? null
            : (openRouteForOrgSlug(row.slug, org?.slug, sourceSlugs) ?? row.routePrefix),
      state: installState({
        appIsActive: row.isActive,
        installed,
        sourceMissing,
        // Only a real system is ever cloned per org, so only it can have a build
        // outstanding; a demo or an in-shell module is servable as it stands.
        needsBuild: installed && kind === "real" ? orgSystemNeedsBuild(org?.slug ?? "", row.slug) : false,
        hasPendingRequest: requestMap.get(row.id) === true,
        // A system that is BOTH cloneable per org and publicly demoable is `real`,
        // so this only reports "demo" when there is genuinely no org-side copy —
        // otherwise the card would offer no install and no build for a system the
        // marketplace's own `installableCardIds` gate already counts installable.
        isDemo: kind === "demo",
        soon,
      }),
      isFavorite: favMap.get(row.id) === true,
    };
  });
}

/** Toggle a favorite (pinned catalog app) for the signed-in user. */
export async function setFavorite(
  userId: string,
  appSlug: string,
  favorite: boolean,
): Promise<{ isFavorite: boolean }> {
  const app = await prisma.app.findUnique({ where: { slug: appSlug }, select: { id: true } });
  if (!app) throw ApiError.notFound("System not found");

  const existing = await prisma.pinnedApp.findFirst({
    where: { userId, appId: app.id },
  });

  if (favorite && !existing) {
    await prisma.pinnedApp.create({ data: { id: randomUUID(), userId, appId: app.id } });
  } else if (!favorite && existing) {
    await prisma.pinnedApp.delete({ where: { id: existing.id } });
  }

  return { isFavorite: favorite };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatOrgApp(row: organizationApp): OrganizationApp {
  return {
    id: row.id,
    organizationId: row.organizationId,
    appId: row.appId,
    status: row.status as AppInstallStatus,
    version: row.version,
    configuration: (row.configuration as Record<string, unknown> | null) ?? undefined,
    settings: (row.settings as Record<string, unknown> | null) ?? undefined,
    installedAt: row.installedAt,
    activatedAt: row.activatedAt ?? undefined,
    disabledAt: row.disabledAt ?? undefined,
  };
}

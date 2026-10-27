import { z } from "zod";
import { prisma } from "@/core/db/client";
import { ApiError } from "@/core/http/api";
import { logger } from "@/core/logging/logger";
import { writeAuditLog } from "@/core/audit/service";
import { encryptValue, decryptValue, isEncrypted } from "@/core/custom-fields/crypto";
import { upsertCatalogApp } from "@/core/apps/service";
import { systemContract } from "@/core/org-vault/system-sources";
import { systemCheckoutDir, ensureCheckout, currentCommitSha } from "./sources";
import { getRepo, installationToken, type GithubRepo } from "./client";
import {
  defaultBuildConfig,
  detectFramework,
  detectPackageManager,
  slugifyRepoName,
  type BuildConfig,
  type Framework,
  type PackageManager,
} from "./detect";

/**
 * Control-plane service for GitHub-backed systems.
 *
 * Import binds a repository to a catalog slug: it checks the repo out under
 * `.systems/<slug>`, detects the stack, registers the `systemSource` row and
 * upserts the catalog `app`. Everything the *runtime* needs (install/build/run)
 * then works unchanged, because `systemSourceDir()` resolves both roots.
 *
 * The contract (`systemContract`) is reported live rather than stored: a
 * repository that does not yet read `SYSTEM_BASE_PATH` can still be imported
 * and deployed, it just cannot be installed for an org until the contract is
 * satisfied. That is the same gate a vendored system passes, and it keeps
 * `installSystemForOrg` the single authority on installability.
 */

const slugField = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "slug must be lowercase kebab-case");

export const importSystemSchema = z.object({
  installationId: z.number().int().positive(),
  repoFullName: z.string().trim().min(3).max(200),
  branch: z.string().trim().min(1).max(200),
  slug: slugField.optional(),
  name: z.string().trim().min(1).max(120),
  nameAr: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().min(1).max(1000),
  descriptionAr: z.string().trim().min(1).max(1000).optional(),
  icon: z.string().trim().min(1).max(64).default("box"),
  category: z.string().trim().min(1).max(64).default("business"),
  /** Optional explicit overrides; detected when omitted. */
  framework: z.enum(["next", "vite", "node", "unknown"]).optional(),
  packageManager: z.enum(["npm", "pnpm", "yarn", "bun"]).optional(),
});

export type ImportSystemInput = z.infer<typeof importSystemSchema>;

export interface ImportSystemResult {
  slug: string;
  repoFullName: string;
  branch: string;
  commitSha: string;
  framework: Framework;
  packageManager: PackageManager;
  /** Empty when the system can be installed right away. */
  missing: string[];
  created: boolean;
}

/** Stores (or refreshes) the installation row GitHub reports. */
export async function recordInstallation(input: {
  id: number;
  accountLogin: string;
  accountType: string;
  repositorySelection: string;
  suspended: boolean;
}): Promise<void> {
  await prisma.githubInstallation.upsert({
    where: { id: input.id },
    create: {
      id: input.id,
      accountLogin: input.accountLogin,
      accountType: input.accountType,
      repositorySelection: input.repositorySelection,
      suspended: input.suspended,
    },
    update: {
      accountLogin: input.accountLogin,
      accountType: input.accountType,
      repositorySelection: input.repositorySelection,
      suspended: input.suspended,
    },
  });
}

/** A system source row joined with what the admin card needs to render. */
export interface GithubSystemView {
  slug: string;
  repoFullName: string;
  repoId: string | null;
  installationId: number;
  accountLogin: string;
  branch: string;
  category: string;
  framework: string | null;
  packageManager: string;
  archived: boolean;
  lastCommitSha: string | null;
  lastCommitMessage: string | null;
  lastSyncedAt: string | null;
  installedOrgs: number;
  contractMissing: string[];
  latestDeployment: {
    id: string;
    status: string;
    commitSha: string;
    trigger: string;
    isActive: boolean;
    error: string | null;
    queuedAt: string;
    finishedAt: string | null;
  } | null;
}

/** Everything the deployment dashboard renders, one row per imported system. */
export async function listGithubSystems(): Promise<GithubSystemView[]> {
  const sources = await prisma.systemSource.findMany({
    orderBy: { createdAt: "desc" },
    include: { installation: true },
  });
  if (sources.length === 0) return [];

  const slugs = sources.map((s) => s.slug);
  const apps = await prisma.app.findMany({ where: { slug: { in: slugs } }, select: { id: true, slug: true } });
  const appIdBySlug = new Map(apps.map((a) => [a.slug, a.id]));

  const [installs, latest] = await Promise.all([
    prisma.organizationApp.groupBy({
      by: ["appId"],
      where: { status: "active", appId: { in: apps.map((a) => a.id) } },
      _count: { appId: true },
    }),
    prisma.systemDeployment.findMany({
      where: { slug: { in: slugs } },
      orderBy: { queuedAt: "desc" },
    }),
  ]);
  const installsByApp = new Map(installs.map((r) => [r.appId, r._count.appId] as const));

  const latestBySlug = new Map<string, (typeof latest)[number]>();
  for (const deployment of latest) {
    if (!latestBySlug.has(deployment.slug)) latestBySlug.set(deployment.slug, deployment);
  }

  return sources.map((source) => {
    const activeOrLatest = latestBySlug.get(source.slug) ?? null;
    const appId = appIdBySlug.get(source.slug);
    return {
      slug: source.slug,
      repoFullName: source.repoFullName,
      repoId: source.repoId,
      installationId: source.installationId,
      accountLogin: source.installation.accountLogin,
      branch: source.branch,
      category: source.category,
      framework: source.framework,
      packageManager: source.packageManager,
      archived: source.archived,
      lastCommitSha: source.lastCommitSha,
      lastCommitMessage: source.lastCommitMessage,
      lastSyncedAt: source.lastSyncedAt?.toISOString() ?? null,
      installedOrgs: appId ? installsByApp.get(appId) ?? 0 : 0,
      contractMissing: source.archived ? [] : systemContract(source.slug).missing,
      latestDeployment: activeOrLatest
        ? {
            id: activeOrLatest.id,
            status: activeOrLatest.status,
            commitSha: activeOrLatest.commitSha,
            trigger: activeOrLatest.trigger,
            isActive: activeOrLatest.isActive,
            error: activeOrLatest.error,
            queuedAt: activeOrLatest.queuedAt.toISOString(),
            finishedAt: activeOrLatest.finishedAt?.toISOString() ?? null,
          }
        : null,
    };
  });
}

export async function getSystemSource(slug: string) {
  return prisma.systemSource.findUnique({ where: { slug }, include: { installation: true } });
}

/**
 * Imports a repository as a system.
 *
 * Order matters: the source is checked out and the contract evaluated *before*
 * the catalog row is written, so a repository we cannot even clone never
 * becomes a system an org can see.
 */
export async function importSystem(input: ImportSystemInput, actorUserId: string): Promise<ImportSystemResult> {
  const data = importSystemSchema.parse(input);
  const slug = data.slug ?? slugifyRepoName(data.repoFullName.split("/")[1] ?? data.name);
  if (!slugField.safeParse(slug).success) {
    throw ApiError.badRequest(`Could not derive a valid system slug (got "${slug}"); provide one explicitly.`);
  }

  const repo: GithubRepo | null = await getRepo(data.installationId, ...splitRepo(data.repoFullName));
  if (!repo) {
    throw ApiError.badRequest(`The installation cannot access ${data.repoFullName}. Check the repository selection.`);
  }

  const existing = await prisma.systemSource.findUnique({ where: { slug } });
  if (existing && existing.repoFullName !== repo.fullName) {
    throw ApiError.conflict(`Slug "${slug}" is already bound to ${existing.repoFullName}. Pick another slug.`);
  }

  const token = await installationToken(data.installationId);
  const checkout = await ensureCheckout({ slug, repoFullName: repo.fullName, branch: data.branch, token });

  const framework = data.framework ?? detectFramework(checkout.dir);
  const packageManager = data.packageManager ?? detectPackageManager(checkout.dir);
  const buildConfig = defaultBuildConfig(framework, packageManager);

  const nameAr = data.nameAr ?? data.name;
  const descriptionAr = data.descriptionAr ?? data.description;

  await upsertCatalogApp({
    slug,
    name: data.name,
    nameAr,
    description: data.description,
    descriptionAr,
    icon: data.icon,
    category: data.category,
    version: "1.0.0",
    routePrefix: `/app/${slug}`,
    isActive: true,
    status: "active",
  });

  await recordInstallation({
    id: data.installationId,
    accountLogin: repo.owner,
    accountType: "Organization",
    repositorySelection: "selected",
    suspended: false,
  });

  await prisma.systemSource.upsert({
    where: { slug },
    create: {
      slug,
      repoId: String(repo.id),
      repoFullName: repo.fullName,
      installationId: data.installationId,
      branch: data.branch,
      category: data.category,
      framework,
      packageManager,
      buildConfig: buildConfig as unknown as object,
      lastCommitSha: checkout.sha,
      lastCommitMessage: null,
      lastSyncedAt: new Date(),
      archived: false,
    },
    update: {
      repoId: String(repo.id),
      repoFullName: repo.fullName,
      installationId: data.installationId,
      branch: data.branch,
      category: data.category,
      framework,
      packageManager,
      lastCommitSha: checkout.sha,
      lastSyncedAt: new Date(),
      archived: false,
    },
  });

  const missing = systemContract(slug).missing;

  await prisma.$transaction(async (tx) => {
    await writeAuditLog(tx, { userId: actorUserId }, {
      actorUserId,
      action: "platform.system.imported",
      entityType: "systemSource",
      entityId: slug,
      after: { repoFullName: repo.fullName, branch: data.branch, commitSha: checkout.sha, missing },
    });
  });

  logger.info({ slug, repo: repo.fullName, branch: data.branch, sha: checkout.sha, created: checkout.created }, "system imported from GitHub");

  return {
    slug,
    repoFullName: repo.fullName,
    branch: data.branch,
    commitSha: checkout.sha,
    framework,
    packageManager,
    missing,
    created: checkout.created,
  };
}

function splitRepo(fullName: string): [string, string] {
  const [owner, repo] = fullName.split("/");
  if (!owner || !repo) throw ApiError.badRequest(`Invalid repository name: ${fullName}`);
  return [owner, repo];
}

/** One system, archived or not. Archiving stops deploys but keeps orgs running. */
export async function setSystemArchived(slug: string, archived: boolean, actorUserId: string): Promise<void> {
  const source = await prisma.systemSource.findUnique({ where: { slug } });
  if (!source) throw ApiError.notFound(`No imported system named "${slug}"`);
  await prisma.systemSource.update({ where: { slug }, data: { archived } });
  await prisma.app.updateMany({ where: { slug }, data: { isActive: !archived } });
  await prisma.$transaction(async (tx) => {
    await writeAuditLog(tx, { userId: actorUserId }, {
      actorUserId,
      action: archived ? "platform.system.disconnected" : "platform.system.reconnected",
      entityType: "systemSource",
      entityId: slug,
      after: { repoFullName: source.repoFullName },
    });
  });
}

/** Changes the deployment branch (does not deploy; the admin deploys next). */
export async function setSystemBranch(slug: string, branch: string, actorUserId: string): Promise<void> {
  const source = await prisma.systemSource.findUnique({ where: { slug } });
  if (!source) throw ApiError.notFound(`No imported system named "${slug}"`);
  await prisma.systemSource.update({ where: { slug }, data: { branch } });
  await prisma.$transaction(async (tx) => {
    await writeAuditLog(tx, { userId: actorUserId }, {
      actorUserId,
      action: "platform.system.branch_changed",
      entityType: "systemSource",
      entityId: slug,
      before: { branch: source.branch },
      after: { branch },
    });
  });
}

/** Re-pins the checkout to whatever the current branch tip is. */
export async function refreshSystemSource(slug: string): Promise<{ sha: string }> {
  const source = await prisma.systemSource.findUnique({ where: { slug } });
  if (!source) throw ApiError.notFound(`No imported system named "${slug}"`);
  const token = await installationToken(source.installationId);
  const checkout = await ensureCheckout({
    slug,
    repoFullName: source.repoFullName,
    branch: source.branch,
    token,
  });
  await prisma.systemSource.update({
    where: { slug },
    data: { lastCommitSha: checkout.sha, lastSyncedAt: new Date() },
  });
  return { sha: checkout.sha };
}

/** Records the tip of the branch without changing the working tree. */
export async function markSynced(slug: string, commitSha: string, message: string | null): Promise<void> {
  await prisma.systemSource.update({
    where: { slug },
    data: { lastCommitSha: commitSha, lastCommitMessage: message, lastSyncedAt: new Date() },
  });
}

export { currentCommitSha, systemCheckoutDir };

// ── Environment variables ──────────────────────────────────────────────────

export interface EnvVarView {
  key: string;
  isSecret: boolean;
  updatedAt: string;
}

/** Env var metadata for the admin UI. Values are never returned in plaintext. */
export async function listEnvVars(slug: string): Promise<EnvVarView[]> {
  const rows = await prisma.systemEnvVar.findMany({ where: { slug }, orderBy: { key: "asc" } });
  return rows.map((row) => ({ key: row.key, isSecret: row.isSecret, updatedAt: row.updatedAt.toISOString() }));
}

export async function setEnvVar(
  slug: string,
  key: string,
  value: string,
  isSecret: boolean,
  actorUserId: string,
): Promise<void> {
  if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
    throw ApiError.badRequest("Environment variable names must be UPPER_SNAKE_CASE.");
  }
  const source = await prisma.systemSource.findUnique({ where: { slug } });
  if (!source) throw ApiError.notFound(`No imported system named "${slug}"`);
  await prisma.systemEnvVar.upsert({
    where: { slug_key: { slug, key } },
    create: { slug, key, valueEnc: encryptValue(value), isSecret },
    update: { valueEnc: encryptValue(value), isSecret },
  });
  await prisma.$transaction(async (tx) => {
    await writeAuditLog(tx, { userId: actorUserId }, {
      actorUserId,
      action: "platform.system.env_set",
      entityType: "systemEnvVar",
      entityId: `${slug}:${key}`,
      after: { key, isSecret },
    });
  });
}

export async function deleteEnvVar(slug: string, key: string, actorUserId: string): Promise<void> {
  await prisma.systemEnvVar.deleteMany({ where: { slug, key } });
  await prisma.$transaction(async (tx) => {
    await writeAuditLog(tx, { userId: actorUserId }, {
      actorUserId,
      action: "platform.system.env_deleted",
      entityType: "systemEnvVar",
      entityId: `${slug}:${key}`,
    });
  });
}

/**
 * Decrypted env vars for a build. Called only by the deployment worker, never
 * by a request handler that could echo them.
 */
export async function resolveEnvVars(slug: string): Promise<Record<string, string>> {
  const rows = await prisma.systemEnvVar.findMany({ where: { slug } });
  const out: Record<string, string> = {};
  for (const row of rows) {
    out[row.key] = isEncrypted(row.valueEnc) ? decryptValue(row.valueEnc) : row.valueEnc;
  }
  return out;
}

export type { BuildConfig };

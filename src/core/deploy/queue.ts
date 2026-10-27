import { prisma } from "@/core/db/client";

/**
 * Persistence for deployments — the queue the worker drains.
 *
 * Deliberately has no knowledge of git, builds or runtimes: it only moves
 * `systemDeployment` / `systemDeploymentOrg` rows between states and records
 * log lines, so the pipeline can be reasoned about (and tested) without a
 * filesystem or a child process. Every write here is idempotent or guarded by a
 * status predicate, because the worker may retry after a crash.
 */

/**
 * Deployment states that still hold the per-slug slot. While any of these is
 * present for a slug, no second deployment for that slug may start: two builds
 * writing `.systems/<slug>` at once would race on the same checkout.
 */
export const RUNNING_STATUSES = [
  "queued",
  "fetching",
  "installing",
  "building",
  "testing",
  "deploying",
  "activating",
] as const;

/** States a deployment never leaves. */
export const TERMINAL_STATUSES = ["active", "failed", "rolled_back", "superseded"] as const;

export type DeploymentStatus = (typeof RUNNING_STATUSES)[number] | (typeof TERMINAL_STATUSES)[number];
export type OrgDeployStatus = "pending" | "building" | "active" | "failed" | "skipped";

export interface EnqueueInput {
  slug: string;
  commitSha: string;
  commitMessage?: string | null;
  ref: string;
  trigger: "manual" | "webhook" | "redeploy" | "rollback";
  createdByUserId?: string | null;
}

/**
 * Queues a deployment, reusing an in-flight one for the same commit.
 *
 * A commit already queued or running is the same intent as this one — a
 * redelivered webhook or a double-clicked deploy button must not spend a second
 * full build. A commit that already went active is returned as-is too: asking to
 * deploy what is already live is a no-op, not a rebuild.
 */
export async function enqueueDeployment(input: EnqueueInput): Promise<string> {
  const existing = await prisma.systemDeployment.findFirst({
    where: {
      slug: input.slug,
      commitSha: input.commitSha,
      status: { in: [...RUNNING_STATUSES, "active"] },
    },
    orderBy: { queuedAt: "desc" },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.systemDeployment.create({
    data: {
      slug: input.slug,
      commitSha: input.commitSha,
      commitMessage: input.commitMessage ?? null,
      ref: input.ref,
      trigger: input.trigger,
      status: "queued",
      createdByUserId: input.createdByUserId ?? null,
    },
    select: { id: true },
  });
  return created.id;
}

export interface ClaimedDeployment {
  id: string;
  slug: string;
  commitSha: string;
  commitMessage: string | null;
  ref: string;
  trigger: string;
}

/**
 * Claims the oldest queued deployment whose slug is not already busy.
 *
 * The claim is the `status = queued` predicate on the UPDATE, so two workers
 * racing the same row leave exactly one winner; the loser's count is 0 and it
 * moves on. Busy slugs are skipped rather than blocked, so one slug's long build
 * never stalls another slug's queue.
 */
export async function claimNextDeployment(): Promise<ClaimedDeployment | null> {
  const queued = await prisma.systemDeployment.findMany({
    where: { status: "queued" },
    orderBy: { queuedAt: "asc" },
    take: 25,
    select: { id: true, slug: true },
  });

  for (const candidate of queued) {
    const busy = await prisma.systemDeployment.findFirst({
      where: {
        slug: candidate.slug,
        id: { not: candidate.id },
        status: { in: [...RUNNING_STATUSES] },
      },
      select: { id: true },
    });
    if (busy) continue;

    const claimed = await prisma.systemDeployment.updateMany({
      where: { id: candidate.id, status: "queued" },
      data: { status: "fetching", startedAt: new Date() },
    });
    if (claimed.count === 0) continue;

    const row = await prisma.systemDeployment.findUniqueOrThrow({
      where: { id: candidate.id },
      select: { id: true, slug: true, commitSha: true, commitMessage: true, ref: true, trigger: true },
    });
    return row;
  }
  return null;
}

/** Moves a deployment to a new state, recording the error text when there is one. */
export async function setDeploymentStatus(
  id: string,
  status: DeploymentStatus,
  error?: string | null,
): Promise<void> {
  const terminal = (TERMINAL_STATUSES as readonly string[]).includes(status);
  await prisma.systemDeployment.update({
    where: { id },
    data: {
      status,
      error: error === undefined ? undefined : error,
      finishedAt: terminal ? new Date() : undefined,
      isActive: status === "active" ? true : status === "failed" || status === "rolled_back" ? false : undefined,
    },
  });
}

/** One line in the deployment console. */
export async function logLine(
  deploymentId: string | null,
  slug: string,
  level: "info" | "warn" | "error",
  message: string,
): Promise<void> {
  const text = message.length > 4000 ? `${message.slice(0, 4000)}…` : message;
  await prisma.deploymentLog.create({ data: { deploymentId, slug, level, message: text } }).catch(() => {
    // A log write must never fail the deployment it describes.
  });
}

/** Records the per-org fan-out rows once, before rollout begins. */
export async function createOrgRows(deploymentId: string, organizationIds: string[]): Promise<void> {
  if (organizationIds.length === 0) return;
  await prisma.systemDeploymentOrg.createMany({
    data: organizationIds.map((organizationId) => ({ deploymentId, organizationId, status: "pending" })),
    skipDuplicates: true,
  });
}

/** Advances one org's rollout row. */
export async function setOrgStatus(
  deploymentId: string,
  organizationId: string,
  status: OrgDeployStatus,
  patch: { error?: string | null; previousSha?: string | null } = {},
): Promise<void> {
  await prisma.systemDeploymentOrg.update({
    where: { deploymentId_organizationId: { deploymentId, organizationId } },
    data: { status, error: patch.error ?? undefined, previousSha: patch.previousSha ?? undefined },
  });
}

/**
 * Records a webhook delivery and reports whether it is new.
 *
 * GitHub redelivers on any non-2xx, so the delivery id is the primary key: a
 * replay collides and `false` is returned, which is what makes redelivery a
 * no-op instead of a second deployment.
 */
export async function recordDelivery(input: {
  id: string;
  event: string;
  repoFullName: string | null;
  action: string | null;
  status: "received" | "ignored" | "queued" | "error";
  detail?: string | null;
}): Promise<boolean> {
  try {
    await prisma.githubWebhookDelivery.create({
      data: {
        id: input.id,
        event: input.event,
        repoFullName: input.repoFullName,
        action: input.action,
        status: input.status,
        detail: input.detail ?? null,
      },
    });
    return true;
  } catch (err) {
    if (isUniqueViolation(err)) return false;
    throw err;
  }
}

/** Updates the outcome of a delivery whose id was already claimed. */
export async function finaliseDelivery(
  id: string,
  status: "received" | "ignored" | "queued" | "error",
  detail?: string | null,
): Promise<void> {
  await prisma.githubWebhookDelivery
    .update({ where: { id }, data: { status, detail: detail ?? null } })
    .catch(() => undefined);
}

/** True when the deployment row's own delivery was already recorded. */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === "P2002"
  );
}

/**
 * Deployment history for one system, newest first, with per-org outcomes.
 *
 * The admin console renders this as the list you pick a rollback target from,
 * so the commit sha is what the caller acts on — never a row id, which would
 * let a stale page redeploy something the admin no longer sees.
 */
export interface DeploymentHistoryRow {
  id: string;
  commitSha: string;
  commitMessage: string | null;
  ref: string;
  status: string;
  trigger: string;
  isActive: boolean;
  error: string | null;
  queuedAt: string;
  finishedAt: string | null;
  orgs: { organizationId: string; status: string; error: string | null }[];
}

export async function listDeploymentHistory(slug: string, take = 50): Promise<DeploymentHistoryRow[]> {
  const rows = await prisma.systemDeployment.findMany({
    where: { slug },
    orderBy: { queuedAt: "desc" },
    take,
    include: { orgs: { select: { organizationId: true, status: true, error: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    commitSha: row.commitSha,
    commitMessage: row.commitMessage,
    ref: row.ref,
    status: row.status,
    trigger: row.trigger,
    isActive: row.isActive,
    error: row.error,
    queuedAt: row.queuedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    orgs: row.orgs,
  }));
}

/**
 * Queues a re-deploy (or rollback) of a commit this system has already shipped.
 *
 * The sha is deliberately restricted to commits that appear in this slug's own
 * deployment history: "roll back to this" is the whole intent, and allowing an
 * arbitrary sha would turn the endpoint into a way to build any commit the
 * installation can read, with no audit trail of having seen it before. The
 * pipeline already checks out whatever sha it is given (`git reset --hard`), so
 * re-deploying an older commit works with no further machinery.
 */
export async function enqueueReplay(input: {
  slug: string;
  commitSha: string;
  trigger: "redeploy" | "rollback";
  actorUserId: string;
}): Promise<{ deploymentId: string; commitSha: string; ref: string }> {
  const prior = await prisma.systemDeployment.findFirst({
    where: { slug: input.slug, commitSha: input.commitSha },
    select: { ref: true },
  });
  if (!prior) {
    throw new Error(`"${input.commitSha}" is not a commit this system has deployed before.`);
  }

  const deploymentId = await enqueueDeployment({
    slug: input.slug,
    commitSha: input.commitSha,
    ref: prior.ref,
    trigger: input.trigger,
    createdByUserId: input.actorUserId,
  });
  return { deploymentId, commitSha: input.commitSha, ref: prior.ref };
}

/**
 * Returns deployments stranded mid-run by a crash back to the queue.
 *
 * The worker's progress is a database row, not memory, so a restart mid-build
 * leaves a row in `building` that nothing will ever finish. Only rows older than
 * the cutoff are touched, so a deployment that is genuinely running right now in
 * another process is never stolen.
 */
export async function requeueStaleDeployments(olderThanMs = 20 * 60_000): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const result = await prisma.systemDeployment.updateMany({
    where: {
      status: { in: ["fetching", "installing", "building", "testing", "deploying", "activating"] },
      startedAt: { lt: cutoff },
    },
    data: { status: "queued", startedAt: null },
  });
  return result.count;
}

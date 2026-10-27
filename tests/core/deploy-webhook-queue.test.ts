import "@/core/config/load-env";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/core/db/client";
import { enqueueDeployment, enqueueReplay, listDeploymentHistory, requeueStaleDeployments } from "@/core/deploy/queue";
import { handleGithubWebhook } from "@/core/deploy/webhook";

/**
 * The deployment queue and the webhook router — the two pieces that decide
 * *whether* a deploy happens and *for which commit*.
 *
 * The heavy machinery (git, builds, runtime swaps) is deliberately out of scope:
 * these tests pin the routing decisions that are cheap to get wrong and
 * expensive to debug in production — a push to the wrong branch shipping code,
 * or a redelivered webhook building the same commit twice.
 */

const installationId = Math.floor(Date.now() / 1000);
const slugs: string[] = [];

async function makeSource(opts: { repoFullName: string; branch: string; archived?: boolean }): Promise<string> {
  const slug = `gh-${randomUUID().slice(0, 8)}`;
  slugs.push(slug);
  await prisma.systemSource.create({
    data: {
      slug,
      repoFullName: opts.repoFullName,
      installationId,
      branch: opts.branch,
      archived: opts.archived ?? false,
    },
  });
  return slug;
}

const deploymentFor = (slug: string, sha: string) =>
  prisma.systemDeployment.findFirst({ where: { slug, commitSha: sha }, orderBy: { queuedAt: "desc" } });

beforeAll(async () => {
  await prisma.githubInstallation.upsert({
    where: { id: installationId },
    create: {
      id: installationId,
      accountLogin: "BusinessOS-Test",
      accountType: "Organization",
      repositorySelection: "all",
      suspended: false,
    },
    update: {},
  });
});

afterAll(async () => {
  for (const slug of slugs) {
    // Deleting the source cascades to its deployments, logs and org rows.
    await prisma.systemSource.delete({ where: { slug } }).catch(() => undefined);
  }
  await prisma.githubWebhookDelivery.deleteMany({ where: { id: { startsWith: "test-delivery-" } } });
  await prisma.githubInstallation.delete({ where: { id: installationId } }).catch(() => undefined);
});

describe("enqueueDeployment", () => {
  it("reuses an in-flight deployment for the same commit instead of queueing a second", async () => {
    const slug = await makeSource({ repoFullName: "acme/dup", branch: "main" });
    const sha = randomUUID().replace(/-/g, "");

    const first = await enqueueDeployment({ slug, commitSha: sha, ref: "main", trigger: "webhook" });
    const second = await enqueueDeployment({ slug, commitSha: sha, ref: "main", trigger: "webhook" });

    expect(second).toBe(first);
    expect(await prisma.systemDeployment.count({ where: { slug, commitSha: sha } })).toBe(1);
  });

  it("queues a distinct deployment for a new commit", async () => {
    const slug = await makeSource({ repoFullName: "acme/distinct", branch: "main" });
    const a = await enqueueDeployment({ slug, commitSha: "a".repeat(40), ref: "main", trigger: "webhook" });
    const b = await enqueueDeployment({ slug, commitSha: "b".repeat(40), ref: "main", trigger: "webhook" });
    expect(a).not.toBe(b);
  });
});

describe("webhook routing", () => {
  it("queues a deployment for a push to the deploy branch", async () => {
    const slug = await makeSource({ repoFullName: "acme/main-app", branch: "main" });
    const sha = "c".repeat(40);

    const result = await handleGithubWebhook({
      event: "push",
      deliveryId: `test-delivery-${randomUUID()}`,
      payload: {
        ref: "refs/heads/main",
        after: sha,
        repository: { full_name: "acme/main-app" },
        head_commit: { message: "fix: a bug" },
      },
    });

    expect(result.status).toBe("queued");
    const deployment = await deploymentFor(slug, sha);
    expect(deployment?.status).toBe("queued");
    expect(deployment?.trigger).toBe("webhook");
    expect(deployment?.commitMessage).toBe("fix: a bug");
  });

  it("ignores a push to a branch that is not the deploy branch", async () => {
    const slug = await makeSource({ repoFullName: "acme/other-branch", branch: "main" });
    const sha = "d".repeat(40);

    const result = await handleGithubWebhook({
      event: "push",
      deliveryId: `test-delivery-${randomUUID()}`,
      payload: { ref: "refs/heads/feature", after: sha, repository: { full_name: "acme/other-branch" } },
    });

    expect(result.status).toBe("ignored");
    expect(await deploymentFor(slug, sha)).toBeNull();
  });

  it("ignores a push for a repository that was never imported", async () => {
    const result = await handleGithubWebhook({
      event: "push",
      deliveryId: `test-delivery-${randomUUID()}`,
      payload: { ref: "refs/heads/main", after: "e".repeat(40), repository: { full_name: "acme/unknown" } },
    });
    expect(result.status).toBe("ignored");
  });

  it("ignores a push to a disconnected system", async () => {
    const slug = await makeSource({ repoFullName: "acme/archived", branch: "main", archived: true });
    const sha = "f".repeat(40);

    const result = await handleGithubWebhook({
      event: "push",
      deliveryId: `test-delivery-${randomUUID()}`,
      payload: { ref: "refs/heads/main", after: sha, repository: { full_name: "acme/archived" } },
    });

    expect(result.status).toBe("ignored");
    expect(await deploymentFor(slug, sha)).toBeNull();
  });

  it("treats a redelivered event as a no-op", async () => {
    await makeSource({ repoFullName: "acme/redeliver", branch: "main" });
    const deliveryId = `test-delivery-${randomUUID()}`;
    const payload = {
      ref: "refs/heads/main",
      after: "1".repeat(40),
      repository: { full_name: "acme/redeliver" },
    };

    const first = await handleGithubWebhook({ event: "push", deliveryId, payload });
    const second = await handleGithubWebhook({ event: "push", deliveryId, payload });

    expect(first.status).toBe("queued");
    expect(second.status).toBe("ignored");
    expect(second.detail).toBe("duplicate delivery");
  });

  it("ignores a branch deletion rather than deploying an all-zero sha", async () => {
    await makeSource({ repoFullName: "acme/deleted-branch", branch: "main" });
    const result = await handleGithubWebhook({
      event: "push",
      deliveryId: `test-delivery-${randomUUID()}`,
      payload: { ref: "refs/heads/main", after: "0".repeat(40), deleted: true, repository: { full_name: "acme/deleted-branch" } },
    });
    expect(result.status).toBe("ignored");
  });
});

describe("requeueStaleDeployments", () => {
  it("returns a deployment stranded by a crash to the queue", async () => {
    const slug = await makeSource({ repoFullName: "acme/stranded", branch: "main" });
    const id = await enqueueDeployment({ slug, commitSha: "2".repeat(40), ref: "main", trigger: "webhook" });
    // Stands in for a worker that died mid-build: a running status, long ago.
    await prisma.systemDeployment.update({
      where: { id },
      data: { status: "building", startedAt: new Date(Date.now() - 60 * 60_000) },
    });

    const requeued = await requeueStaleDeployments(1000);
    expect(requeued).toBeGreaterThanOrEqual(1);

    const row = await prisma.systemDeployment.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("queued");
    expect(row.startedAt).toBeNull();
  });
});

describe("enqueueReplay (rollback)", () => {
  const actor = "test-admin";

  it("queues a rollback of a past commit as trigger 'rollback' carrying its original ref", async () => {
    const slug = await makeSource({ repoFullName: "acme/rollback", branch: "release" });
    const sha = "3".repeat(40);
    const past = await enqueueDeployment({ slug, commitSha: sha, ref: "release", trigger: "webhook" });
    // A finished deploy is what an admin rolls back *to*.
    await prisma.systemDeployment.update({ where: { id: past }, data: { status: "failed", finishedAt: new Date() } });

    const replay = await enqueueReplay({ slug, commitSha: sha, trigger: "rollback", actorUserId: actor });
    expect(replay.commitSha).toBe(sha);
    expect(replay.ref).toBe("release");

    const row = await prisma.systemDeployment.findUniqueOrThrow({ where: { id: replay.deploymentId } });
    expect(row.trigger).toBe("rollback");
    expect(row.status).toBe("queued");
    expect(row.createdByUserId).toBe(actor);
  });

  it("does not queue a second rollback while one for the same commit is still in flight", async () => {
    const slug = await makeSource({ repoFullName: "acme/rollback-dedupe", branch: "main" });
    const sha = "4".repeat(40);
    await enqueueDeployment({ slug, commitSha: sha, ref: "main", trigger: "webhook" });

    const first = await enqueueReplay({ slug, commitSha: sha, trigger: "rollback", actorUserId: actor });
    const second = await enqueueReplay({ slug, commitSha: sha, trigger: "rollback", actorUserId: actor });

    expect(second.deploymentId).toBe(first.deploymentId);
    expect(await prisma.systemDeployment.count({ where: { slug, commitSha: sha } })).toBe(1);
  });

  it("refuses a commit this system has never deployed", async () => {
    const slug = await makeSource({ repoFullName: "acme/rollback-unknown", branch: "main" });
    await expect(
      enqueueReplay({ slug, commitSha: "5".repeat(40), trigger: "rollback", actorUserId: actor }),
    ).rejects.toThrow(/has deployed before/);
  });

  it("lists history newest first", async () => {
    const slug = await makeSource({ repoFullName: "acme/rollback-history", branch: "main" });
    const sha = "6".repeat(40);
    const past = await enqueueDeployment({ slug, commitSha: sha, ref: "main", trigger: "webhook" });
    await prisma.systemDeployment.update({
      where: { id: past },
      data: { status: "failed", finishedAt: new Date(), queuedAt: new Date(Date.now() - 3600_000) },
    });
    await enqueueReplay({ slug, commitSha: sha, trigger: "rollback", actorUserId: actor });

    const rows = await listDeploymentHistory(slug);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.trigger).toBe("rollback");
    expect(rows[1]!.trigger).toBe("webhook");
  });
});

import { z } from "zod";
import { prisma } from "@/core/db/client";
import { ApiError, enforceRateLimit, ok, withRoute } from "@/core/http/api";
import { requirePlatformAdmin } from "@/core/platform/gate";
import { writeAuditLog } from "@/core/audit/service";
import { enqueueReplay, listDeploymentHistory } from "@/core/deploy/queue";

const replaySchema = z.object({
  commitSha: z.string().trim().regex(/^[a-f0-9]{7,64}$/i, "commitSha must be a hex commit sha"),
  /** "rollback" is the default intent: re-running an old commit on purpose. */
  trigger: z.enum(["redeploy", "rollback"]).default("rollback"),
});

/**
 * GET  /api/platform/github/systems/[slug]/deployments — deploy history.
 * POST /api/platform/github/systems/[slug]/deployments — re-deploy/rollback a commit.
 *
 * Platform admin only. The POST takes a commit **sha**, not a deployment id, and
 * only accepts a commit this system has already deployed (see `enqueueReplay`):
 * "roll back to this" is the whole point, and an arbitrary sha would make this a
 * way to build any commit the installation can reach. The worker does the real
 * work, so the route only queues and returns 201.
 */
export const GET = withRoute(
  "platform.github.deployments.list",
  async (request, ctx: { params: Promise<{ slug: string }> }) => {
    enforceRateLimit(request, "platform:deployments:list", 30, 60_000);
    await requirePlatformAdmin(request);
    const { slug } = await ctx.params;
    const deployments = await listDeploymentHistory(slug);
    return ok({ slug, deployments });
  },
);

export const POST = withRoute(
  "platform.github.deployments.replay",
  async (request, ctx: { params: Promise<{ slug: string }> }) => {
    enforceRateLimit(request, "platform:deployments:replay", 10, 60_000);
    const admin = await requirePlatformAdmin(request);
    const { slug } = await ctx.params;
    const body = replaySchema.parse(await request.json().catch(() => {
      throw ApiError.badRequest("Expected a JSON body with commitSha");
    }));

    let replay: Awaited<ReturnType<typeof enqueueReplay>>;
    try {
      replay = await enqueueReplay({ slug, commitSha: body.commitSha, trigger: body.trigger, actorUserId: admin.id });
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw ApiError.badRequest(err instanceof Error ? err.message : "Could not queue that commit");
    }

    await prisma.$transaction(async (tx) => {
      await writeAuditLog(tx, { userId: admin.id }, {
        actorUserId: admin.id,
        action: body.trigger === "rollback" ? "platform.system.rollback" : "platform.system.redeploy",
        entityType: "systemDeployment",
        entityId: replay.deploymentId,
        after: { slug, commitSha: replay.commitSha, ref: replay.ref, trigger: body.trigger },
      });
    });

    return ok({ slug, ...replay, trigger: body.trigger }, { status: 201 });
  },
);

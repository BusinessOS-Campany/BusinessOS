import { z } from "zod";
import { ApiError, enforceRateLimit, ok, withRoute } from "@/core/http/api";
import { requirePlatformAdmin } from "@/core/platform/gate";
import { refreshSystemSource, setSystemArchived, setSystemBranch } from "@/core/github/service";

const patchSchema = z
  .object({
    branch: z.string().trim().min(1).max(200).optional(),
    archived: z.boolean().optional(),
    refresh: z.boolean().optional(),
  })
  .refine((v) => v.branch !== undefined || v.archived !== undefined || v.refresh !== undefined, {
    message: "Provide branch, archived and/or refresh",
  });

/**
 * PATCH  /api/platform/github/systems/[slug] — branch, disconnect/reconnect, resync.
 * DELETE /api/platform/github/systems/[slug] — disconnect (archive) the source.
 *
 * Neither removes tenant installs or data: a disconnected system keeps running
 * for the orgs that already installed it, it simply stops receiving deploys.
 */
export const PATCH = withRoute(
  "platform.github.system.update",
  async (request, ctx: { params: Promise<{ slug: string }> }) => {
    enforceRateLimit(request, "platform:system:update", 30, 60_000);
    const admin = await requirePlatformAdmin(request);
    const { slug } = await ctx.params;
    const body = patchSchema.parse(await request.json().catch(() => null));

    if (body.branch !== undefined) await setSystemBranch(slug, body.branch, admin.id);
    if (body.archived !== undefined) await setSystemArchived(slug, body.archived, admin.id);
    const refreshed = body.refresh ? await refreshSystemSource(slug) : null;
    return ok({ slug, refreshed });
  },
);

export const DELETE = withRoute(
  "platform.github.system.disconnect",
  async (request, ctx: { params: Promise<{ slug: string }> }) => {
    enforceRateLimit(request, "platform:system:delete", 20, 60_000);
    const admin = await requirePlatformAdmin(request);
    const { slug } = await ctx.params;
    try {
      await setSystemArchived(slug, true, admin.id);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw ApiError.internal("Failed to disconnect the system");
    }
    return ok({ slug, disconnected: true });
  },
);

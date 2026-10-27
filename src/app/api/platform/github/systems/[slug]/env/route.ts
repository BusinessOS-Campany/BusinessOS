import { z } from "zod";
import { ApiError, enforceRateLimit, ok, withRoute } from "@/core/http/api";
import { requirePlatformAdmin } from "@/core/platform/gate";
import { deleteEnvVar, listEnvVars, setEnvVar } from "@/core/github/service";

const setSchema = z.object({
  key: z.string().trim().min(1).max(128),
  value: z.string().max(8000),
  isSecret: z.boolean().default(true),
});

const deleteSchema = z.object({ key: z.string().trim().min(1).max(128) });

/**
 * GET/POST/DELETE the environment variables of one system.
 *
 * `GET` never returns a value — only the key and whether it is secret — so a
 * secret cannot be read back out of the admin console once set. A replacement
 * is written by sending a new value.
 */
export const GET = withRoute(
  "platform.github.system.env.list",
  async (request, ctx: { params: Promise<{ slug: string }> }) => {
    enforceRateLimit(request, "platform:env:list", 30, 60_000);
    await requirePlatformAdmin(request);
    const { slug } = await ctx.params;
    return ok({ envVars: await listEnvVars(slug) });
  },
);

export const POST = withRoute(
  "platform.github.system.env.set",
  async (request, ctx: { params: Promise<{ slug: string }> }) => {
    enforceRateLimit(request, "platform:env:set", 30, 60_000);
    const admin = await requirePlatformAdmin(request);
    const { slug } = await ctx.params;
    const parsed = setSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Invalid environment variable payload");
    await setEnvVar(slug, parsed.data.key, parsed.data.value, parsed.data.isSecret, admin.id);
    return ok({ envVars: await listEnvVars(slug) });
  },
);

export const DELETE = withRoute(
  "platform.github.system.env.delete",
  async (request, ctx: { params: Promise<{ slug: string }> }) => {
    enforceRateLimit(request, "platform:env:delete", 30, 60_000);
    const admin = await requirePlatformAdmin(request);
    const { slug } = await ctx.params;
    const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw ApiError.badRequest("Provide a key to delete");
    await deleteEnvVar(slug, parsed.data.key, admin.id);
    return ok({ envVars: await listEnvVars(slug) });
  },
);

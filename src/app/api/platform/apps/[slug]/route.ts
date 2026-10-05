import { z } from "zod";
import { ApiError, ok, withRoute } from "@/core/http/api";
import { requirePlatformAdmin } from "@/core/platform/gate";
import { deleteCatalogApp, updateCatalogApp } from "@/core/apps/service";

const patchSchema = z
  .object({
    isActive: z.boolean().optional(),
    status: z.enum(["active", "in-maintenance", "deprecated"]).optional(),
    image: z.string().trim().max(512).optional(),
    schemaKey: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9_]+$/, "schemaKey must be lowercase alphanumeric/underscore")
      .optional(),
  })
  .refine(
    (v) =>
      v.isActive !== undefined ||
      v.status !== undefined ||
      v.image !== undefined ||
      v.schemaKey !== undefined,
    { message: "Provide isActive, status, image and/or schemaKey" },
  );

/**
 * PATCH  /api/platform/apps/[slug] — availability toggle.
 * DELETE /api/platform/apps/[slug] — remove (guarded against in-use systems).
 */
export const PATCH = withRoute(
  "platform.apps.update",
  async (request, ctx: { params: Promise<{ slug: string }> }) => {
    await requirePlatformAdmin(request);
    const { slug } = await ctx.params;
    const body = patchSchema.parse(await request.json().catch(() => null));
    const app = await updateCatalogApp(slug, body);
    if (!app) throw ApiError.notFound("System not found");
    return ok({ app });
  },
);

export const DELETE = withRoute(
  "platform.apps.delete",
  async (request, ctx: { params: Promise<{ slug: string }> }) => {
    await requirePlatformAdmin(request);
    const { slug } = await ctx.params;
    const result = await deleteCatalogApp(slug);
    if (!result.deleted) throw ApiError.notFound("System not found");
    return ok({ deleted: true });
  },
);
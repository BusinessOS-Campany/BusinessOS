import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { setFavorite } from "@/core/apps/service";

/**
 * PUT    /api/v1/marketplace/favorites/[slug] — pin a system for the user.
 * DELETE /api/v1/marketplace/favorites/[slug] — unpin.
 */
export const PUT = withRoute(
  "marketplace.favorites.add",
  async (request, ctx: { params: Promise<{ slug: string }> }) => {
    const { slug } = await ctx.params;
    const ctxT = await requireTenantContext(request);
    const result = await setFavorite(ctxT.tenant.userId, slug, true);
    return ok(result);
  },
);

export const DELETE = withRoute(
  "marketplace.favorites.remove",
  async (request, ctx: { params: Promise<{ slug: string }> }) => {
    const { slug } = await ctx.params;
    const ctxT = await requireTenantContext(request);
    const result = await setFavorite(ctxT.tenant.userId, slug, false);
    return ok(result);
  },
);
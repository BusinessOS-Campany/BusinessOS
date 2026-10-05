import { ApiError, ok, withRoute } from "@/core/http/api";
import { requirePlatformAdmin } from "@/core/platform/gate";
import { getAppCatalog, upsertCatalogApp } from "@/core/apps/service";
import { catalogAppSchema } from "@/core/systems/catalog";

/**
 * GET  /api/platform/apps — full system catalog (admin manager).
 * POST /api/platform/apps — create/update a catalog entry.
 */
export const GET = withRoute("platform.apps.list", async (request) => {
  await requirePlatformAdmin(request);
  return ok({ apps: await getAppCatalog() });
});

export const POST = withRoute("platform.apps.create", async (request) => {
  await requirePlatformAdmin(request);
  const body = await request.json().catch(() => {
    throw ApiError.badRequest("Invalid JSON body");
  });
  const parsed = catalogAppSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid catalog payload", {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  const app = await upsertCatalogApp(parsed.data);
  return ok({ app }, { status: 200 });
});
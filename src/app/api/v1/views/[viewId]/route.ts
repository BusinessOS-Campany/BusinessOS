import { z } from "zod";
import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { requirePermission } from "@/core/db/tenant-guard";
import { prisma } from "@/core/db/client";

/** PATCH /api/v1/views/[viewId] — update a saved view. */
export const PATCH = withRoute("v1.views.update", async (request, context) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { settings: ["manage"] });

  const { viewId } = (context as { params: { viewId: string } }).params;

  const existing = await prisma.savedView.findFirst({
    where: { id: viewId, organizationId: tenant.organizationId },
  });
  if (!existing) throw (await import("@/core/http/api")).ApiError.notFound("View not found");

  const patchSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    config: z.record(z.string(), z.unknown()).optional(),
  });
  const body = patchSchema.parse(await request.json().catch(() => null));

  const view = await prisma.savedView.update({
    where: { id: viewId },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.config !== undefined && { config: body.config as never }),
    },
  });
  return ok({ view });
});

/** DELETE /api/v1/views/[viewId] — delete a saved view. */
export const DELETE = withRoute("v1.views.delete", async (request, context) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { settings: ["manage"] });

  const { viewId } = (context as { params: { viewId: string } }).params;

  const existing = await prisma.savedView.findFirst({
    where: { id: viewId, organizationId: tenant.organizationId },
  });
  if (!existing) throw (await import("@/core/http/api")).ApiError.notFound("View not found");

  await prisma.savedView.delete({ where: { id: viewId } });
  return ok({ id: viewId });
});

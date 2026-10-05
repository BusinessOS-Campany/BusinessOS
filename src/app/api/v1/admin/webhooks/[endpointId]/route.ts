import { z } from "zod";
import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { requirePermission } from "@/core/db/tenant-guard";
import { prisma } from "@/core/db/client";

/** PATCH /api/v1/admin/webhooks/[endpointId] — update a webhook endpoint. */
export const PATCH = withRoute("v1.admin.webhooks.update", async (request, context) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { settings: ["manage"] });

  const { endpointId } = (context as { params: { endpointId: string } }).params;
  const existing = await prisma.webhookEndpoint.findFirst({
    where: { id: endpointId, organizationId: tenant.organizationId },
  });
  if (!existing) throw (await import("@/core/http/api")).ApiError.notFound("Webhook endpoint not found");

  const patchSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    url: z.string().url().max(500).optional(),
    signingKey: z.string().max(200).optional(),
    events: z.array(z.string()).optional(),
    isActive: z.boolean().optional(),
  });
  const body = patchSchema.parse(await request.json().catch(() => null));

  const endpoint = await prisma.webhookEndpoint.update({
    where: { id: endpointId },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.url !== undefined && { url: body.url }),
      ...(body.signingKey !== undefined && { signingKey: body.signingKey }),
      ...(body.events !== undefined && { events: body.events as never }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
    },
  });
  return ok({ endpoint });
});

/** DELETE /api/v1/admin/webhooks/[endpointId] — delete a webhook endpoint. */
export const DELETE = withRoute("v1.admin.webhooks.delete", async (request, context) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { settings: ["manage"] });

  const { endpointId } = (context as { params: { endpointId: string } }).params;
  const existing = await prisma.webhookEndpoint.findFirst({
    where: { id: endpointId, organizationId: tenant.organizationId },
  });
  if (!existing) throw (await import("@/core/http/api")).ApiError.notFound("Webhook endpoint not found");

  await prisma.webhookEndpoint.delete({ where: { id: endpointId } });
  return ok({ id: endpointId });
});

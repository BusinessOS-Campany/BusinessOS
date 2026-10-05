import { z } from "zod";
import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { requirePermission } from "@/core/db/tenant-guard";
import { prisma } from "@/core/db/client";
import { listDeliveries, retryDelivery } from "@/core/integrations/webhooks";

export const GET = withRoute("v1.admin.deliveries.list", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { integrations: ["read"] });

  const url = new URL(request.url);
  const endpointId = url.searchParams.get("endpointId");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 100);

  if (!endpointId) {
    // List all deliveries for this org
    const deliveries = await prisma.webhookDelivery.findMany({
      where: { organizationId: tenant.organizationId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        eventType: true,
        status: true,
        responseStatus: true,
        attempt: true,
        lastError: true,
        deliveredAt: true,
        createdAt: true,
      },
    });
    return ok({ deliveries });
  }

  const deliveries = await listDeliveries(prisma, tenant.organizationId, endpointId, limit);
  return ok({ deliveries });
});

const retrySchema = z.object({ deliveryId: z.string().min(1) });

export const POST = withRoute("v1.admin.deliveries.retry", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { integrations: ["manage"] });
  const body = retrySchema.parse(await request.json().catch(() => null));

  const result = await retryDelivery(prisma, tenant, body.deliveryId);
  return ok(result);
});

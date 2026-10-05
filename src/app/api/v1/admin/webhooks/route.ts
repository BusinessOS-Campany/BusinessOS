import { z } from "zod";
import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { requirePermission } from "@/core/db/tenant-guard";
import { prisma } from "@/core/db/client";

/** GET /api/v1/admin/webhooks — list webhook endpoints. */
export const GET = withRoute("v1.admin.webhooks.list", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { settings: ["manage"] });

  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { organizationId: tenant.organizationId },
    orderBy: { createdAt: "desc" },
  });
  return ok({ endpoints });
});

const createSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url().max(500),
  signingKey: z.string().max(200).optional(),
  events: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
});

/** POST /api/v1/admin/webhooks — create a webhook endpoint. */
export const POST = withRoute("v1.admin.webhooks.create", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { settings: ["manage"] });

  const body = createSchema.parse(await request.json().catch(() => null));
  const endpoint = await prisma.webhookEndpoint.create({
    data: {
      organizationId: tenant.organizationId,
      name: body.name,
      url: body.url,
      signingKey: body.signingKey,
      events: body.events as never,
      isActive: body.isActive,
    },
  });
  return ok({ endpoint }, { status: 201 });
});

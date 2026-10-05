import { z } from "zod";
import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { requirePermission } from "@/core/db/tenant-guard";
import { prisma } from "@/core/db/client";

/** GET /api/v1/dashboard — fetch user's dashboard layout (or default). */
export const GET = withRoute("v1.dashboard.get", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { settings: ["read"] });

  const layout = await prisma.dashboardLayout.findUnique({
    where: {
      organizationId_userId: {
        organizationId: tenant.organizationId,
        userId: tenant.userId,
      },
    },
  });

  // Return default empty layout if none saved
  return ok({
    layout: layout ?? {
      id: null,
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      layout: { widgets: [] },
    },
  });
});

const updateLayoutSchema = z.object({
  layout: z.object({
    widgets: z.array(
      z.object({
        i: z.string(),
        type: z.string(),
        moduleId: z.string().optional(),
        title: z.string().optional(),
        x: z.number().int().min(0),
        y: z.number().int().min(0),
        w: z.number().int().min(1),
        h: z.number().int().min(1),
      }),
    ),
  }),
});

/** PATCH /api/v1/dashboard — upsert user's dashboard widget layout. */
export const PATCH = withRoute("v1.dashboard.upsert", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { settings: ["manage"] });

  const body = updateLayoutSchema.parse(await request.json().catch(() => null));

  const layout = await prisma.dashboardLayout.upsert({
    where: {
      organizationId_userId: {
        organizationId: tenant.organizationId,
        userId: tenant.userId,
      },
    },
    create: {
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      layout: body.layout as never,
    },
    update: {
      layout: body.layout as never,
    },
  });

  return ok({ layout });
});

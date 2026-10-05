import { z } from "zod";
import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { requirePermission } from "@/core/db/tenant-guard";
import { prisma } from "@/core/db/client";

/** GET /api/v1/views?entityType=X — list saved views for current user + shared. */
export const GET = withRoute("v1.views.list", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { settings: ["read"] });

  const url = new URL(request.url);
  const entityType = url.searchParams.get("entityType");

  const views = await prisma.savedView.findMany({
    where: {
      organizationId: tenant.organizationId,
      ...(entityType ? { entityType } : {}),
      OR: [{ userId: null }, { userId: tenant.userId }],
    },
    orderBy: { createdAt: "desc" },
  });
  return ok({ views });
});

const createViewSchema = z.object({
  entityType: z.string().min(1),
  name: z.string().min(1).max(100),
  shared: z.boolean().default(false),
  config: z.object({
    columns: z.array(z.string()).default([]),
    filters: z.array(
      z.object({
        key: z.string(),
        op: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "contains"]),
        value: z.union([z.string(), z.number(), z.boolean()]),
      }),
    ).default([]),
    sort: z.object({
      key: z.string(),
      dir: z.enum(["asc", "desc"]),
    }).optional(),
  }),
});

/** POST /api/v1/views — create a saved view. */
export const POST = withRoute("v1.views.create", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { settings: ["manage"] });

  const body = createViewSchema.parse(await request.json().catch(() => null));
  const view = await prisma.savedView.create({
    data: {
      organizationId: tenant.organizationId,
      userId: body.shared ? null : tenant.userId,
      entityType: body.entityType,
      name: body.name,
      config: body.config as never,
    },
  });
  return ok({ view }, { status: 201 });
});

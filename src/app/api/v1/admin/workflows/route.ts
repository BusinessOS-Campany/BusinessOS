import { z } from "zod";
import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { requirePermission } from "@/core/db/tenant-guard";
import { prisma } from "@/core/db/client";

/** GET /api/v1/admin/workflows — list workflow rules. */
export const GET = withRoute("v1.admin.workflows.list", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { workflows: ["read"] });

  const rules = await prisma.workflowRule.findMany({
    where: { organizationId: tenant.organizationId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });
  return ok({ rules });
});

const createSchema = z.object({
  name: z.string().min(1).max(100),
  triggerEvent: z.string().min(1).max(60),
  conditions: z.record(z.string(), z.unknown()).default({}),
  actions: z.array(z.record(z.string(), z.unknown())).min(1),
  isActive: z.boolean().default(true),
  isDraft: z.boolean().default(false),
});

/** POST /api/v1/admin/workflows — create a workflow rule. */
export const POST = withRoute("v1.admin.workflows.create", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { workflows: ["manage"] });

  const body = createSchema.parse(await request.json().catch(() => null));
  const rule = await prisma.workflowRule.create({
    data: {
      organizationId: tenant.organizationId,
      name: body.name,
      triggerEvent: body.triggerEvent,
      conditions: body.conditions as never,
      actions: body.actions as never,
      isActive: body.isActive,
      isDraft: body.isDraft,
    },
  });
  return ok({ rule }, { status: 201 });
});

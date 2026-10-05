import { z } from "zod";
import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { requirePermission } from "@/core/db/tenant-guard";
import { prisma } from "@/core/db/client";

/** PATCH /api/v1/admin/workflows/[ruleId] — update a workflow rule. */
export const PATCH = withRoute("v1.admin.workflows.update", async (request, context) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { workflows: ["manage"] });

  const { ruleId } = (context as { params: { ruleId: string } }).params;
  const existing = await prisma.workflowRule.findFirst({
    where: { id: ruleId, organizationId: tenant.organizationId },
  });
  if (!existing) throw (await import("@/core/http/api")).ApiError.notFound("Workflow rule not found");

  const patchSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    triggerEvent: z.string().min(1).max(60).optional(),
    conditions: z.record(z.string(), z.unknown()).optional(),
    actions: z.array(z.record(z.string(), z.unknown())).optional(),
    isActive: z.boolean().optional(),
    isDraft: z.boolean().optional(),
  });
  const body = patchSchema.parse(await request.json().catch(() => null));

  const rule = await prisma.workflowRule.update({
    where: { id: ruleId },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.triggerEvent !== undefined && { triggerEvent: body.triggerEvent }),
      ...(body.conditions !== undefined && { conditions: body.conditions as never }),
      ...(body.actions !== undefined && { actions: body.actions as never }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
      ...(body.isDraft !== undefined && { isDraft: body.isDraft }),
    },
  });
  return ok({ rule });
});

/** DELETE /api/v1/admin/workflows/[ruleId] — delete a workflow rule. */
export const DELETE = withRoute("v1.admin.workflows.delete", async (request, context) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { workflows: ["manage"] });

  const { ruleId } = (context as { params: { ruleId: string } }).params;
  const existing = await prisma.workflowRule.findFirst({
    where: { id: ruleId, organizationId: tenant.organizationId },
  });
  if (!existing) throw (await import("@/core/http/api")).ApiError.notFound("Workflow rule not found");

  await prisma.workflowRule.delete({ where: { id: ruleId } });
  return ok({ id: ruleId });
});

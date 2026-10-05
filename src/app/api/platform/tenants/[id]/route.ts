import { z } from "zod";
import { ApiError, ok, withRoute } from "@/core/http/api";
import { requirePlatformAdmin } from "@/core/platform/gate";
import { prisma } from "@/core/db/client";
import { writeAuditLog } from "@/core/audit/service";

const patchTenant = z.object({
  status: z.enum(["active", "suspended", "cancelled"]).optional(),
  planCode: z.string().optional(),
  reason: z.string().max(500).optional(),
});

export const PATCH = withRoute("platform.tenants.update", async (request, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requirePlatformAdmin(request);
  const { id } = await ctx.params;
  const body = patchTenant.parse(await request.json().catch(() => null));

  const existing = await prisma.organization.findUnique({ where: { id }, select: { id: true, status: true, planId: true } });
  if (!existing) throw ApiError.notFound("Tenant not found");

  let newPlanId: string | undefined;
  if (body.planCode) {
    const plan = await prisma.plan.findUnique({ where: { code: body.planCode }, select: { id: true } });
    if (!plan) throw ApiError.badRequest("Unknown planCode");
    newPlanId = plan.id;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.update({
      where: { id },
      data: {
        ...(body.status ? { status: body.status } : {}),
        ...(newPlanId ? { planId: newPlanId } : {}),
      },
      select: { id: true, name: true, slug: true, status: true, planId: true },
    });
    await writeAuditLog(tx, { organizationId: id, userId: admin.id }, {
      action: "platform.tenant.updated",
      entityType: "organization",
      entityId: id,
      before: { status: existing.status, planId: existing.planId },
      after: { status: org.status, planId: org.planId, ...(body.reason ? { reason: body.reason } : {}) },
    });
    return org;
  });

  // Kill active sessions of suspended tenants so the block takes effect immediately.
  if (body.status && body.status !== "active") {
    await prisma.session.updateMany({ where: { activeOrganizationId: id }, data: { activeOrganizationId: null } });
  }

  return ok({ tenant: updated });
});

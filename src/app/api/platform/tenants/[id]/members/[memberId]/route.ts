import { z } from "zod";
import { ApiError, ok, withRoute } from "@/core/http/api";
import { requirePlatformAdmin } from "@/core/platform/gate";
import { prisma } from "@/core/db/client";
import { writeAuditLog } from "@/core/audit/service";
import { isTenantRole } from "@/core/permissions/catalog";

const patchBody = z.object({
  role: z.string().min(1).max(40),
});

/**
 * Platform member management for a tenant's accounts.
 *
 * PATCH  — change a member's tenant role. Never removes the last owner;
 *          an owner can only be demoted once another owner exists.
 * DELETE — remove a member from the tenant. Owners cannot be removed
 *          (either demote them first or keep the org under their control).
 */
export const PATCH = withRoute(
  "platform.tenants.members.update",
  async (request, ctx: { params: Promise<{ id: string; memberId: string }> }) => {
    const admin = await requirePlatformAdmin(request);
    const { id, memberId } = await ctx.params;
    const body = patchBody.parse(await request.json().catch(() => null));

    if (!isTenantRole(body.role)) throw ApiError.badRequest("Unknown tenant role");

    const member = await prisma.member.findFirst({
      where: { id: memberId, organizationId: id },
      select: { id: true, role: true, userId: true, user: { select: { email: true } } },
    });
    if (!member) throw ApiError.notFound("Member not found");

    if (member.role === "owner" && body.role !== "owner") {
      const owners = await prisma.member.count({
        where: { organizationId: id, role: "owner" },
      });
      if (owners <= 1) {
        throw ApiError.conflict("Cannot demote the last owner — grant another owner first");
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.member.update({
        where: { id: memberId },
        data: { role: body.role },
        select: { id: true, role: true },
      });
      await writeAuditLog(tx, { organizationId: id, userId: admin.id }, {
        action: "platform.tenant.member_role_changed",
        entityType: "member",
        entityId: memberId,
        before: { role: member.role, email: member.user.email },
        after: { role: row.role },
      });
      return row;
    });

    return ok({ member: updated });
  },
);

export const DELETE = withRoute(
  "platform.tenants.members.remove",
  async (request, ctx: { params: Promise<{ id: string; memberId: string }> }) => {
    const admin = await requirePlatformAdmin(request);
    const { id, memberId } = await ctx.params;

    const member = await prisma.member.findFirst({
      where: { id: memberId, organizationId: id },
      select: { id: true, role: true, userId: true, user: { select: { email: true } } },
    });
    if (!member) throw ApiError.notFound("Member not found");
    if (member.role === "owner") {
      throw ApiError.conflict("Owners cannot be removed — change their role first");
    }

    await prisma.$transaction(async (tx) => {
      await tx.member.delete({ where: { id: memberId } });
      // Drop the tenant's active-org pointer so they don't keep tenant cookies.
      await tx.session.updateMany({
        where: { userId: member.userId, activeOrganizationId: id },
        data: { activeOrganizationId: null },
      });
      // And drop any password the platform was mirroring into this org's copies
      // of its systems, for the same reason the cookie is dropped above: this
      // person no longer has any business signing in here.
      await tx.systemCredential.deleteMany({
        where: { organizationId: id, userId: member.userId },
      });
      await writeAuditLog(tx, { organizationId: id, userId: admin.id }, {
        action: "platform.tenant.member_removed",
        entityType: "member",
        entityId: memberId,
        after: { email: member.user.email, role: member.role },
      });
    });

    return ok({ removed: memberId });
  },
);
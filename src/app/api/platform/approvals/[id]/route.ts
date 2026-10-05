import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ApiError, ok, withRoute } from "@/core/http/api";
import { requirePlatformAdmin } from "@/core/platform/gate";
import { prisma } from "@/core/db/client";
import { writeAuditLog } from "@/core/audit/service";
import { ORG_STATUS } from "@/core/platform/approval";
import { isTenantRole } from "@/core/permissions/catalog";
import { provisionTenantSchema } from "@/core/tenancy/schemas";
import { cloneInstalledSystem } from "@/core/apps/service";

const approveBody = z.object({
  action: z.enum(["approve", "reject"]),
  appSlugs: z.array(z.string()).default([]),
  planCode: z.string().optional(),
  ownerRole: z.string().optional(),
  reason: z.string().max(500).optional(),
});

/**
 * Approves or rejects a pending self-registered tenant.
 *
 * Approve: activates the org, installs the granted apps, assigns the plan and
 * the owner's tenant role. Reject: marks the org "rejected".
 */
export const POST = withRoute(
  "platform.approvals.decide",
  async (request, ctx: { params: Promise<{ id: string }> }) => {
    const admin = await requirePlatformAdmin(request);
    const { id } = await ctx.params;
    const body = approveBody.parse(await request.json().catch(() => null));

    const org = await prisma.organization.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        templateCode: true,
        members: { where: { role: "owner" }, select: { userId: true, user: { select: { email: true } } }, take: 1 },
      },
    });
    if (!org) throw ApiError.notFound("Tenant not found");
    if (org.status !== ORG_STATUS.PENDING && org.status !== ORG_STATUS.REJECTED) {
      throw ApiError.conflict("Tenant is not pending or rejected");
    }

    if (body.action === "reject") {
      await prisma.$transaction(async (tx) => {
        await tx.organization.update({
          where: { id },
          data: { status: ORG_STATUS.REJECTED },
        });
        await writeAuditLog(tx, { organizationId: id, userId: admin.id }, {
          action: "platform.tenant.rejected",
          entityType: "organization",
          entityId: id,
          after: { name: org.name, slug: org.slug, ...(body.reason ? { reason: body.reason } : {}) },
        });
      });
      return ok({ tenant: { id, status: ORG_STATUS.REJECTED } });
    }

    const planCode = body.planCode ?? "trial";
    const plan = await prisma.plan.findUnique({ where: { code: planCode }, select: { id: true } });
    if (!plan) throw ApiError.badRequest("Unknown planCode");

    const ownerRole = body.ownerRole ?? "owner";
    if (!isTenantRole(ownerRole)) throw ApiError.badRequest("Unknown tenant role");

    const appSlugs = [...new Set(body.appSlugs)].slice(0, 50);
    const apps = await prisma.app.findMany({
      where: { slug: { in: appSlugs } },
      select: { id: true, slug: true, version: true },
    });
    if (apps.length !== appSlugs.length) {
      throw ApiError.badRequest("One or more appSlugs do not exist");
    }

    const ownerUser =
      org.members[0] ??
      (await prisma.member.findFirst({
        where: { organizationId: id, role: "owner" },
        select: { userId: true, user: { select: { email: true } } },
      }));
    if (!ownerUser) throw ApiError.conflict("Tenant has no owner member");

    // Schema-per-org: the new tenant gets its isolated schema `t_<slug>` in the
    // shared server, holding empty copies of every tenant-owned table.
    const schemaName = await provisionTenantSchema({ id, slug: org.slug });

    const granted = await prisma.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id },
        data: { status: ORG_STATUS.ACTIVE, planId: plan.id, schemaName },
      });
      for (const app of apps) {
        await tx.organizationApp.upsert({
          where: {
            organizationId_appId: { organizationId: id, appId: app.id },
          },
          update: { status: "active", version: app.version, activatedAt: new Date() },
          create: {
            id: randomUUID(),
            organizationId: id,
            appId: app.id,
            status: "active",
            version: app.version,
            activatedAt: new Date(),
          },
        });
      }
      await tx.member.updateMany({
        where: { organizationId: id, role: "owner" },
        data: { role: ownerRole },
      });
      await writeAuditLog(tx, { organizationId: id, userId: admin.id }, {
        action: "platform.tenant.approved",
        entityType: "organization",
        entityId: id,
        after: {
          name: org.name,
          slug: org.slug,
          planCode,
          ownerRole,
          appSlugs: appSlugs.length ? appSlugs : null,
          ownerEmail: ownerUser.user.email,
        },
      });
      return { plan: planCode, ownerRole, apps: apps.map((a) => a.slug) };
    });

    // The `organization_apps` rows are committed, so from here the org OWNS these
    // systems and each one needs its own private copy of the source under
    // `orginazition/<org>/systems/<slug>/`. Without this the approval reported
    // success and `/{org}/{system}` failed with SYSTEM_NOT_PROVISIONED on first
    // open, because the folder the vault points at had never been created.
    //
    // Best-effort and after the commit: `cloneInstalledSystem` swallows its own
    // errors, most catalog systems are in-shell modules with no source folder,
    // and a copy failure must not retroactively un-approve the tenant.
    for (const app of apps) {
      await cloneInstalledSystem(id, app.slug);
    }

    return ok({ tenant: { id, status: ORG_STATUS.ACTIVE }, granted });
  },
);
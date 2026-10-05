import { z } from "zod";
import { ApiError, ok, withRoute } from "@/core/http/api";
import { requirePlatformAdmin } from "@/core/platform/gate";
import { prisma } from "@/core/db/client";
import { writeAuditLog } from "@/core/audit/service";
import { cloneInstalledSystem } from "@/core/apps/service";

const installBody = z.object({ appSlug: z.string().min(1).max(80) });

/**
 * Platform-driven app provisioning for a tenant.
 *
 * POST   /api/platform/tenants/[id]/apps        — grant (install) an app
 * DELETE /api/platform/tenants/[id]/apps/[appId] — revoke (disable) an app
 */
export const POST = withRoute(
  "platform.tenants.apps.install",
  async (request, ctx: { params: Promise<{ id: string }> }) => {
    const admin = await requirePlatformAdmin(request);
    const { id } = await ctx.params;
    const body = installBody.parse(await request.json().catch(() => null));

    const org = await prisma.organization.findUnique({ where: { id }, select: { id: true } });
    if (!org) throw ApiError.notFound("Tenant not found");

    const app = await prisma.app.findUnique({ where: { slug: body.appSlug } });
    if (!app) throw ApiError.notFound("App not found");

    const granted = await prisma.$transaction(async (tx) => {
      const row = await tx.organizationApp.upsert({
        where: { organizationId_appId: { organizationId: id, appId: app.id } },
        update: { status: "active", version: app.version, activatedAt: new Date(), disabledAt: null },
        create: {
          id: crypto.randomUUID(),
          organizationId: id,
          appId: app.id,
          status: "active",
          version: app.version,
          activatedAt: new Date(),
        },
      });
      await writeAuditLog(tx, { organizationId: id, userId: admin.id }, {
        action: "platform.tenant.app_granted",
        entityType: "organizationApp",
        entityId: row.id,
        after: { appSlug: app.slug, status: "active" },
      });
      return row;
    });

    // Same rule as the approval queue: granting a system gives the org its own
    // private copy of the source, so the first request for `/{org}/{system}`
    // finds a folder instead of SYSTEM_NOT_PROVISIONED. Best-effort, after the
    // commit, so a copy failure cannot undo a grant the admin already made.
    await cloneInstalledSystem(id, app.slug);

    return ok({ organizationApp: granted }, { status: 201 });
  },
);
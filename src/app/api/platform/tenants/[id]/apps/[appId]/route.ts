import { ApiError, ok, withRoute } from "@/core/http/api";
import { requirePlatformAdmin } from "@/core/platform/gate";
import { prisma } from "@/core/db/client";
import { writeAuditLog } from "@/core/audit/service";
import { stopOrgRuntime } from "@/core/systems/runtime/supervisor";

/**
 * Revoke an app from a tenant: access is removed but the row (and any app
 * data) is kept so re-granting later is cheap and auditable.
 *
 * The org's Node process for the system is stopped first, so a revoked system
 * cannot keep serving from a runtime nobody owns any more.
 */
export const DELETE = withRoute(
  "platform.tenants.apps.revoke",
  async (request, ctx: { params: Promise<{ id: string; appId: string }> }) => {
    const admin = await requirePlatformAdmin(request);
    const { id, appId } = await ctx.params;

    const orgApp = await prisma.organizationApp.findUnique({
      where: { organizationId_appId: { organizationId: id, appId } },
      include: { app: { select: { slug: true } }, organization: { select: { slug: true } } },
    });
    if (!orgApp) throw ApiError.notFound("App is not installed on this tenant");

    const stopped = stopOrgRuntime(orgApp.organization.slug, orgApp.app.slug);

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.organizationApp.update({
        where: { id: orgApp.id },
        data: { status: "disabled", disabledAt: new Date() },
      });
      await writeAuditLog(tx, { organizationId: id, userId: admin.id }, {
        action: "platform.tenant.app_revoked",
        entityType: "organizationApp",
        entityId: row.id,
        before: { appSlug: orgApp.app.slug, status: orgApp.status },
        after: { appSlug: orgApp.app.slug, status: "disabled", runtimeStopped: stopped },
      });
      return row;
    });

    return ok({ organizationApp: updated });
  },
);
import { ApiError, ok, withRoute } from "@/core/http/api";
import { prisma } from "@/core/db/client";
import { requireTenantContext } from "@/core/tenancy/context";
import { requirePermission } from "@/core/db/tenant-guard";
import { installState, openRouteForSlug, systemKind } from "@/core/systems/catalog";
import { writeAuditLog } from "@/core/audit/service";
import { requestSystemForTenant } from "@/core/apps/service";
import { listSystemSources } from "@/core/org-vault/system-sources";

/**
 * POST /api/v1/apps/[slug]/request
 *
 * The marketplace card's action, and the one `/systems` and `/{org}/my-apps`
 * both post to. It ALWAYS queues: an org receives a system only after a platform
 * admin approves it at `/platform-admin/approvals`, which is where
 * `installSystemForOrg` is called.
 *
 * It used to delegate to `installSystemForOrg`, which installs immediately, so a
 * tenant click granted a full system with nobody reviewing it. Keeping the two
 * apart is the point: `installSystemForOrg` is what the admin's approval runs,
 * and a customer route that calls it hands the queue away.
 *
 *  - demo systems: instant, returns the demo route. Unchanged legacy path.
 *  - already installed: returns `state: "installed"` with the open route.
 *  - anything else: a pending `organizationAppRequest` (idempotent; a previously
 *    rejected request is reopened).
 *  - disabled systems (`isActive: false`): rejected — admin kill-switch.
 */
export const POST = withRoute(
  "v1.apps.request",
  async (request, ctx: { params: Promise<{ slug: string }> }) => {
    const { slug } = await ctx.params;
    const ctxT = await requireTenantContext(request);
    const organizationId = ctxT.tenant.organizationId;

    const app = await prisma.app.findUnique({ where: { slug } });
    if (!app) throw ApiError.notFound("System not found");
    if (!app.isActive) {
      throw ApiError.badRequest("This system is not available right now");
    }

    const kind = systemKind(slug, listSystemSources());
    const route = openRouteForSlug(slug);

    const existing = await prisma.organizationApp.findUnique({
      where: { organizationId_appId: { organizationId, appId: app.id } },
    });
    if (existing) {
      return ok({
        state: installState({ appIsActive: true, installed: true }),
        route,
      });
    }

    // Demo systems: try instantly — no install row needed.
    if (kind === "demo") {
      await writeAuditLog(prisma, { organizationId, userId: ctxT.tenant.userId }, {
        action: "marketplace.demo.opened",
        entityType: "app",
        entityId: app.id,
      });
      return ok({ state: "demo", route });
    }

    requirePermission(ctxT.tenant, { systems: ["install"] });
    const result = await requestSystemForTenant(organizationId, {
      slug,
      userId: ctxT.tenant.userId,
    });
    return ok({
      state: result.state,
      route: result.route,
      requestId: result.requestId,
      created: result.created,
    });
  },
);

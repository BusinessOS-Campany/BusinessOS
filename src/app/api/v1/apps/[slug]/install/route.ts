import { withRoute, ok } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { requirePermission } from "@/core/db/tenant-guard";
import { orgSystemNeedsBuild, requestSystemForTenant } from "@/core/apps/service";
import { openRouteForOrgSlug } from "@/core/systems/catalog";
import { listSystemSources } from "@/core/org-vault/system-sources";
import { readOrgSystemBootError } from "@/core/systems/runtime/warm";
import { prisma } from "@/core/db/client";
import { ApiError } from "@/core/http/api";

/**
 * POST /api/v1/apps/[slug]/install
 *
 * A tenant asking for a system. It queues a platform-approval request and
 * nothing else; the admin's approval at `/api/platform/app-requests/[id]` is what
 * calls `installSystemForOrg` and hands the org its own copy.
 *
 * It used to install directly, which is how `/install` came to mean a different
 * thing from `/request` on the same card. Both now file the same request.
 *
 * Requires `systems:install` (owner/admin/manager). Idempotent: an installed
 * system reports its state and changes nothing, and a queued one returns the same
 * request rather than a second one.
 * Body: { configuration?: Record<string, unknown> } (accepted, unused)
 */
export const POST = withRoute<{ params: Promise<{ slug: string }> }>(
  "v1.apps.install",
  async (request, { params }) => {
    const ctx = await requireTenantContext(request);
    const { slug } = await params;

    requirePermission(ctx.tenant, { systems: ["install"] });

    await request.json().catch(() => ({}));

    const result = await requestSystemForTenant(ctx.tenant.organizationId, {
      slug,
      userId: ctx.tenant.userId,
    });

    return ok({
      state: result.state,
      route: result.route,
      requestId: result.requestId,
      created: result.created,
    });
  },
);

/**
 * GET /api/v1/apps/[slug]/install
 *
 * Whether this org's copy of the system is runnable yet.
 *
 * Separate from the marketplace payload on purpose: the card polls this while it
 * waits, and re-rendering the whole catalog to learn one boolean would make every
 * other card on the page a casualty of one slow build. Never boots anything —
 * the build is the first open's job, and this only reports what already happened.
 */
export const GET = withRoute<{ params: Promise<{ slug: string }> }>(
  "v1.apps.install.status",
  async (request, { params }) => {
    const ctx = await requireTenantContext(request);
    const { slug } = await params;

    const app = await prisma.app.findUnique({ where: { slug }, select: { id: true } });
    if (!app) {
      throw ApiError.notFound("System not found");
    }

    const installed = await prisma.organizationApp.findUnique({
      where: { organizationId_appId: { organizationId: ctx.tenant.organizationId, appId: app.id } },
      select: { id: true },
    });
    if (!installed) {
      throw ApiError.notFound("This system is not installed for your organization");
    }

    const org = await prisma.organization.findUnique({
      where: { id: ctx.tenant.organizationId },
      select: { slug: true },
    });

    // A warm boot that failed leaves a marker; report it as a terminal `failed`
    // state so the waiting card stops spinning and says why. Cleared by the next
    // successful boot, so this never becomes a permanent lie.
    const bootError = org ? readOrgSystemBootError(org.slug, slug) : null;

    return ok({
      state: bootError
        ? "failed"
        : orgSystemNeedsBuild(org?.slug ?? "", slug)
          ? "preparing"
          : "installed",
      route: openRouteForOrgSlug(slug, org?.slug, listSystemSources()),
      error: bootError?.message ?? null,
    });
  },
);

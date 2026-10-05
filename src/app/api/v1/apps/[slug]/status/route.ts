import { withRoute, ok } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { updateAppStatus } from "@/core/apps/service";
import { prisma } from "@/core/db/client";
import { ApiError } from "@/core/http/api";

/**
 * PATCH /api/v1/apps/[slug]/status
 *
 * Update an installed app's status (activate, disable, suspend).
 * Body: { status: "active" | "disabled" | "suspended" }
 */
export const PATCH = withRoute<{ params: Promise<{ slug: string }> }>(
  "v1.apps.status",
  async (request, { params }) => {
    const ctx = await requireTenantContext(request);
    const { slug } = await params;

    if (ctx.tenant.role !== "owner" && ctx.tenant.role !== "admin") {
      throw ApiError.forbidden("Only organization owners and admins can manage application status");
    }

    const app = await prisma.app.findUnique({ where: { slug } });
    if (!app) {
      throw ApiError.notFound("Application not found");
    }

    const body = await request.json();
    if (!body.status || !["active", "disabled", "suspended"].includes(body.status)) {
      throw ApiError.badRequest("Status must be one of: active, disabled, suspended");
    }

    const orgApp = await updateAppStatus(
      ctx.tenant.organizationId,
      app.id,
      body.status,
    );

    return ok(orgApp);
  },
);

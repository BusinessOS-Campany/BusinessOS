import { withRoute, ok } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { getOrganizationApps } from "@/core/apps/service";

/**
 * GET /api/v1/apps/installed
 *
 * Returns all apps installed by the current organization.
 */
export const GET = withRoute("v1.apps.installed", async (request) => {
  const ctx = await requireTenantContext(request);
  const apps = await getOrganizationApps(ctx.tenant.organizationId);
  return ok(apps);
});

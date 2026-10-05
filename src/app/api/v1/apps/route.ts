import { withRoute, ok } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { getOrganizationApps, getAvailableApps } from "@/core/apps/service";

/**
 * GET /api/v1/apps
 *
 * Returns all apps available on the platform with the current org's install status.
 * If the org has an app installed, its status is included.
 */
export const GET = withRoute("v1.apps.list", async (request) => {
  const ctx = await requireTenantContext(request);
  const apps = await getAvailableApps(ctx.tenant.organizationId);
  return ok(apps);
});

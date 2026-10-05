import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";

import { getDashboardKpis } from "@/core/sama/dashboard";

export const GET = withRoute("v1.sama-center.dashboard", async (request) => {
  const { tenant } = await requireTenantContext(request);

  const kpis = await getDashboardKpis(tenant.organizationId);
  return ok(kpis);
});

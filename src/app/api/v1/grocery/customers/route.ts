import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { requireModule, requirePermission } from "@/core/db/tenant-guard";
import { getOrgSettings } from "@/core/tenancy/settings";
import { listCustomers } from "@/core/grocery/customers";

export const GET = withRoute("v1.grocery.customers.list", async (request) => {
  const { tenant } = await requireTenantContext(request);
  const settings = await getOrgSettings(tenant.organizationId);
  requireModule(settings, "customers");
  requirePermission(tenant, { customers: ["read"] });

  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim() ?? undefined;
  const page = Math.max(Number(url.searchParams.get("page") ?? 1), 1);
  const pageSize = Math.min(Number(url.searchParams.get("pageSize") ?? 20), 100);

  const result = await listCustomers(tenant.organizationId, {
    search,
    page,
    pageSize,
  });

  return ok({ items: result.rows, total: result.total });
});

import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { requireModule, requirePermission } from "@/core/db/tenant-guard";
import { getOrgSettings } from "@/core/tenancy/settings";
import { listProducts } from "@/core/grocery/inventory-mgmt";

export const GET = withRoute("v1.grocery.products.list", async (request) => {
  const { tenant } = await requireTenantContext(request);
  const settings = await getOrgSettings(tenant.organizationId);
  requireModule(settings, "products");
  requirePermission(tenant, { products: ["read"] });

  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim() ?? undefined;
  const categoryId = url.searchParams.get("categoryId") ?? undefined;
  const page = Math.max(Number(url.searchParams.get("page") ?? 1), 1);
  const pageSize = Math.min(Number(url.searchParams.get("pageSize") ?? 20), 100);

  const result = await listProducts(tenant.organizationId, {
    search,
    categoryId,
    page,
    pageSize,
  });

  return ok({ items: result.rows, total: result.total });
});

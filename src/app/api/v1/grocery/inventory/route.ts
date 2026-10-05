import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { requireModule, requirePermission } from "@/core/db/tenant-guard";
import { getOrgSettings } from "@/core/tenancy/settings";
import { listStock } from "@/core/grocery/inventory-mgmt";

export const GET = withRoute("v1.grocery.inventory.list", async (request) => {
  const { tenant } = await requireTenantContext(request);
  const settings = await getOrgSettings(tenant.organizationId);
  requireModule(settings, "inventory");
  requirePermission(tenant, { products: ["read"] });

  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim() ?? undefined;
  const warehouseId = url.searchParams.get("warehouseId") ?? undefined;
  const page = Math.max(Number(url.searchParams.get("page") ?? 1), 1);
  const pageSize = Math.min(Number(url.searchParams.get("pageSize") ?? 20), 100);

  const result = await listStock(tenant.organizationId, {
    warehouseId,
    page,
    pageSize,
  });

  let items = result.rows;

  if (search) {
    const lower = search.toLowerCase();
    items = items.filter(
      (r) =>
        r.product?.nameAr?.toLowerCase().includes(lower) ||
        r.product?.sku?.toLowerCase().includes(lower),
    );
  }

  return ok({ items, total: result.total });
});

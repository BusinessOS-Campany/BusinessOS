import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { requireModule, requirePermission } from "@/core/db/tenant-guard";
import { getOrgSettings } from "@/core/tenancy/settings";
import { listBrands } from "@/core/grocery/brands";

export const GET = withRoute("v1.grocery.brands.list", async (request) => {
  const { tenant } = await requireTenantContext(request);
  const settings = await getOrgSettings(tenant.organizationId);
  requireModule(settings, "products");
  requirePermission(tenant, { products: ["read"] });

  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim() ?? undefined;

  const result = await listBrands(tenant.organizationId, { search });
  return ok(result.rows.map((b) => ({ id: b.id, nameAr: b.nameAr })));
});

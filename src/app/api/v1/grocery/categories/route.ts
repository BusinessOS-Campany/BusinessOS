import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { requireModule, requirePermission } from "@/core/db/tenant-guard";
import { getOrgSettings } from "@/core/tenancy/settings";
import { listCategories } from "@/core/grocery/inventory-mgmt";

export const GET = withRoute("v1.grocery.categories.list", async (request) => {
  const { tenant } = await requireTenantContext(request);
  const settings = await getOrgSettings(tenant.organizationId);
  requireModule(settings, "products");
  requirePermission(tenant, { products: ["read"] });

  const categories = await listCategories(tenant.organizationId);
  return ok(categories.map((c) => ({ id: c.id, nameAr: c.nameAr })));
});

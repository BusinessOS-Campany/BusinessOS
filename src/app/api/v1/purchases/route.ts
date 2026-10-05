import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { requireModule, requirePermission, tenantFilter } from "@/core/db/tenant-guard";
import { getOrgSettings } from "@/core/tenancy/settings";
import { createPurchase, purchaseSchema } from "@/core/purchases/service";
import { prisma } from "@/core/db/client";

export const GET = withRoute("v1.purchases.list", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requireModule(await getOrgSettings(tenant.organizationId), "purchases");
  requirePermission(tenant, { purchases: ["read"] });
  const rows = await prisma.purchase.findMany({
    where: tenantFilter(tenant),
    orderBy: { issuedAt: "desc" },
    take: 50,
    select: {
      id: true,
      number: true,
      supplierId: true,
      total: true,
      paidTotal: true,
      status: true,
      issuedAt: true,
    },
  });
  return ok({ purchases: rows });
});

export const POST = withRoute("v1.purchases.create", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requireModule(await getOrgSettings(tenant.organizationId), "purchases");
  requirePermission(tenant, { purchases: ["create"] });
  const body = purchaseSchema.parse(await request.json().catch(() => null));
  const result = await createPurchase(prisma, tenant, body);
  return ok(result, { status: 201 });
});

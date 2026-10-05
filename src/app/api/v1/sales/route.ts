import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { requireModule, requirePermission, tenantFilter } from "@/core/db/tenant-guard";
import { getOrgSettings } from "@/core/tenancy/settings";
import { createSale, saleSchema } from "@/core/sales/service";
import { prisma } from "@/core/db/client";

export const GET = withRoute("v1.sales.list", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requireModule(await getOrgSettings(tenant.organizationId), "sales");
  requirePermission(tenant, { sales: ["read"] });
  const rows = await prisma.salesInvoice.findMany({
    where: tenantFilter(tenant, { status: "posted" }),
    orderBy: { issuedAt: "desc" },
    take: 50,
    select: {
      id: true,
      number: true,
      customerId: true,
      total: true,
      paidTotal: true,
      issuedAt: true,
    },
  });
  return ok({ invoices: rows });
});

export const POST = withRoute("v1.sales.create", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requireModule(await getOrgSettings(tenant.organizationId), "sales");
  requirePermission(tenant, { sales: ["create"] });
  const body = saleSchema.parse(await request.json().catch(() => null));
  return ok(await createSale(prisma, tenant, body), { status: 201 });
});

import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { requireModule, requirePermission } from "@/core/db/tenant-guard";
import { getOrgSettings } from "@/core/tenancy/settings";
import {
  getDashboardKpis,
  getSalesSeries,
  getTopProducts,
  getRecentSales,
} from "@/core/grocery/dashboard";
import { listLowStock } from "@/core/grocery/inventory-mgmt";
import { prisma } from "@/core/db/client";

export const GET = withRoute("v1.grocery.dashboard", async (request) => {
  const { tenant } = await requireTenantContext(request);
  const settings = await getOrgSettings(tenant.organizationId);
  requireModule(settings, "products");
  requirePermission(tenant, { products: ["read"] });

  const org = await prisma.organization.findUnique({
    where: { id: tenant.organizationId },
    select: { name: true },
  });

  const [kpis, salesTrend, topProducts, recentSales, lowStock] = await Promise.all([
    getDashboardKpis(tenant.organizationId),
    getSalesSeries(tenant.organizationId, 7),
    getTopProducts(tenant.organizationId, 30, 5),
    getRecentSales(tenant.organizationId, 5),
    listLowStock(tenant.organizationId, 10),
  ]);

  return ok({
    orgName: org?.name ?? "",
    kpis: {
      todaySales: kpis.todaySales,
      todayProfit: kpis.todayExpenses,
      lowStockCount: kpis.lowStock.count,
      customerDebt: kpis.debts,
    },
    salesTrend,
    topProducts,
    recentSales,
    lowStock,
  });
});

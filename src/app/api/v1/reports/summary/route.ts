import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { hasPermission, requirePermission } from "@/core/db/tenant-guard";
import { ReportsService } from "@/core/reports/service";
import { prisma } from "@/core/db/client";

/**
 * Reports v1 bundle. Ledger-derived only; access requires reports.read AND
 * finance.read (money figures) — viewers of operations data don't see money.
 */
export const GET = withRoute("v1.reports.summary", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { reports: ["read"] });

  const url = new URL(request.url);
  const days = Math.min(Number(url.searchParams.get("days") ?? 30), 365);
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

  const svc = new ReportsService(prisma);

  if (hasPermission(tenant.role, { finance: ["read"] })) {
    const [sales, profit, inventory, debt, cashflow] = await Promise.all([
      svc.salesSummary(tenant.organizationId, from, to),
      svc.grossProfit(tenant.organizationId, from, to),
      svc.inventoryValuation(tenant.organizationId),
      svc.debtReport(tenant.organizationId),
      svc.cashflow(tenant.organizationId, from, to),
    ]);
    return ok({ periodDays: days, sales, profit, inventory, debt, cashflow });
  }

  // Non-finance callers get operational-only slices.
  const [inventory, salesCount] = await Promise.all([
    svc.inventoryValuation(tenant.organizationId).then((i) => ({ lowStock: i.lowStock })),
    svc.salesSummary(tenant.organizationId, from, to).then((s) => ({ invoices: s.invoices })),
  ]);
  return ok({ periodDays: days, sales: salesCount, inventory });
});

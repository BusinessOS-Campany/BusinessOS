import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { requirePermission } from "@/core/db/tenant-guard";
import { listExpenseCategories } from "@/core/expenses/service";
import { prisma } from "@/core/db/client";

export const GET = withRoute("v1.expenses.categories.list", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { expenses: ["read"] });

  const rows = await listExpenseCategories(prisma, tenant.organizationId);
  return ok(rows.map((c) => ({ id: c.id, name: c.nameAr, nameAr: c.nameAr, nameEn: c.nameEn })));
});
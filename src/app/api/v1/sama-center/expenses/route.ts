import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";

import { createExpense, expenseSchema } from "@/core/expenses/service";
import { prisma } from "@/core/db/client";
import { requirePermission, tenantFilter } from "@/core/db/tenant-guard";

export const GET = withRoute("v1.sama-center.expenses.list", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { expenses: ["read"] });

  const rows = await prisma.expense.findMany({
    where: tenantFilter(tenant),
    orderBy: { spentAt: "desc" },
    take: 50,
  });
  return ok({ expenses: rows });
});

export const POST = withRoute("v1.sama-center.expenses.create", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { expenses: ["create"] });

  const body = expenseSchema.parse(await request.json().catch(() => null));
  return ok(await createExpense(prisma, tenant, body), { status: 201 });
});

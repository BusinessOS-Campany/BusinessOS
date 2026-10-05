import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { requirePermission } from "@/core/db/tenant-guard";
import { deleteExpenseRow, updateExpenseForm } from "@/core/expenses/service";
import { prisma } from "@/core/db/client";

export const PUT = withRoute<{ params: Promise<{ id: string }> }>(
  "v1.sama-center.expenses.update",
  async (request, { params }) => {
    const { tenant } = await requireTenantContext(request);
    requirePermission(tenant, { expenses: ["update"] });

    const { id } = await params;
    const body = await request.json().catch(() => null);
    return ok(await updateExpenseForm(prisma, tenant, id, body ?? {}));
  },
);

export const DELETE = withRoute<{ params: Promise<{ id: string }> }>(
  "v1.sama-center.expenses.delete",
  async (request, { params }) => {
    const { tenant } = await requireTenantContext(request);
    requirePermission(tenant, { expenses: ["delete"] });

    const { id } = await params;
    return ok(await deleteExpenseRow(prisma, tenant, id));
  },
);
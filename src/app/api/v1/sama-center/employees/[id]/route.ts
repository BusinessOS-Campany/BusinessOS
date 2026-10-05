import { requirePermission } from "@/core/db/tenant-guard";
import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";

import { getEmployee, updateEmployee, deleteEmployee, updateEmployeeSchema } from "@/core/sama/employees";

export const GET = withRoute("v1.sama-center.employees.get", async (request, context) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { employees: ["read"] });

  const { id } = (context as { params: { id: string } }).params;
  const employee = await getEmployee(tenant.organizationId, id);
  return ok(employee);
});

export const PUT = withRoute("v1.sama-center.employees.update", async (request, context) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { employees: ["update"] });

  const { id } = (context as { params: { id: string } }).params;
  const body = updateEmployeeSchema.parse(await request.json().catch(() => null));
  const employee = await updateEmployee(
    // @ts-expect-error prisma tx handled internally
    null,
    tenant.organizationId,
    id,
    body,
  );
  return ok(employee);
});

export const DELETE = withRoute("v1.sama-center.employees.delete", async (request, context) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { employees: ["delete"] });

  const { id } = (context as { params: { id: string } }).params;
  const result = await deleteEmployee(
    // @ts-expect-error prisma tx handled internally
    null,
    tenant.organizationId,
    id,
  );
  return ok(result);
});

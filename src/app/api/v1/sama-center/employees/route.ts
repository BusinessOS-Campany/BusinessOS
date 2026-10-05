import { requirePermission } from "@/core/db/tenant-guard";
import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";

import { listEmployees, createEmployee, createEmployeeSchema } from "@/core/sama/employees";

export const GET = withRoute("v1.sama-center.employees.list", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { employees: ["read"] });

  const url = new URL(request.url);
  const department = url.searchParams.get("department") ?? undefined;
  const page = Number(url.searchParams.get("page") ?? 1);
  const pageSize = Number(url.searchParams.get("pageSize") ?? 20);

  const result = await listEmployees(tenant.organizationId, { department, page, pageSize });
  return ok(result);
});

export const POST = withRoute("v1.sama-center.employees.create", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { employees: ["create"] });

  const body = createEmployeeSchema.parse(await request.json().catch(() => null));
  const employee = await createEmployee(
    // @ts-expect-error prisma tx handled internally
    null,
    tenant.organizationId,
    tenant.userId,
    body,
  );
  return ok({ id: employee.id }, { status: 201 });
});

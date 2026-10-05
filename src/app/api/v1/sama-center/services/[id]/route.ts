import { requirePermission } from "@/core/db/tenant-guard";
import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";

import { updateService, deleteService, updateServiceSchema } from "@/core/sama/services";

export const PUT = withRoute("v1.sama-center.services.update", async (request, context) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { products: ["update"] });

  const { id } = (context as { params: { id: string } }).params;
  const body = updateServiceSchema.parse(await request.json().catch(() => null));
  const service = await updateService(
    // @ts-expect-error prisma tx handled internally
    null,
    tenant.organizationId,
    id,
    body,
  );
  return ok(service);
});

export const DELETE = withRoute("v1.sama-center.services.delete", async (request, context) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { products: ["delete"] });

  const { id } = (context as { params: { id: string } }).params;
  const result = await deleteService(
    // @ts-expect-error prisma tx handled internally
    null,
    tenant.organizationId,
    id,
  );
  return ok(result);
});

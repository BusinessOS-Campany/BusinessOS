import { requirePermission } from "@/core/db/tenant-guard";
import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";

import { updateAdvance, deleteAdvance, updateAdvanceSchema } from "@/core/sama/advances";

export const PUT = withRoute("v1.sama-center.advances.update", async (request, context) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { finance: ["manage"] });

  const { id } = (context as { params: { id: string } }).params;
  const body = updateAdvanceSchema.parse(await request.json().catch(() => null));
  const advance = await updateAdvance(
    // @ts-expect-error prisma tx handled internally
    null,
    tenant.organizationId,
    id,
    body,
  );
  return ok(advance);
});

export const DELETE = withRoute("v1.sama-center.advances.delete", async (request, context) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { finance: ["manage"] });

  const { id } = (context as { params: { id: string } }).params;
  const result = await deleteAdvance(
    // @ts-expect-error prisma tx handled internally
    null,
    tenant.organizationId,
    id,
  );
  return ok(result);
});

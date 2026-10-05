import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { requirePermission } from "@/core/db/tenant-guard";
import { updateCustomField, deleteCustomField, fieldUpdateSchema } from "@/core/custom-fields/service";

export const PATCH = withRoute("v1.admin.custom-fields.update", async (request, context) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { custom_fields: ["update"] });

  const { fieldId } = (context as { params: { fieldId: string } }).params;
  const body = fieldUpdateSchema.parse(await request.json().catch(() => null));
  const field = await updateCustomField(tenant, fieldId, body);
  return ok({ field });
});

export const DELETE = withRoute("v1.admin.custom-fields.delete", async (request, context) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { custom_fields: ["delete"] });

  const { fieldId } = (context as { params: { fieldId: string } }).params;
  const result = await deleteCustomField(tenant, fieldId);
  return ok(result);
});

import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { requirePermission } from "@/core/db/tenant-guard";
import { listCustomFields, createCustomField, fieldCreateSchema } from "@/core/custom-fields/service";

export const GET = withRoute("v1.admin.custom-fields.list", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { custom_fields: ["read"] });

  const url = new URL(request.url);
  const entityType = url.searchParams.get("entityType")?.trim() || undefined;

  const fields = await listCustomFields(tenant.organizationId, entityType);
  return ok({ fields });
});

export const POST = withRoute("v1.admin.custom-fields.create", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { custom_fields: ["create"] });

  const body = fieldCreateSchema.parse(await request.json().catch(() => null));
  const field = await createCustomField(tenant, body);
  return ok({ field }, { status: 201 });
});

import { z } from "zod";
import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { prisma } from "@/core/db/client";
import { loadCustomFieldValues, saveCustomFieldValues } from "@/core/custom-fields/service";

/** GET /api/v1/custom-fields/values?entityType=X&entityId=Y */
export const GET = withRoute("v1.custom-fields.values.get", async (request) => {
  const { tenant } = await requireTenantContext(request);

  const url = new URL(request.url);
  const entityType = url.searchParams.get("entityType");
  const entityId = url.searchParams.get("entityId");
  if (!entityType || !entityId) throw (await import("@/core/http/api")).ApiError.badRequest("entityType and entityId are required");

  const values = await loadCustomFieldValues(tenant.organizationId, entityType, entityId);
  return ok({ entityType, entityId, values });
});

const upsertSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  values: z.record(z.string(), z.unknown()),
});

/** PUT /api/v1/custom-fields/values — upsert values for a single entity row. */
export const PUT = withRoute("v1.custom-fields.values.upsert", async (request) => {
  const { tenant } = await requireTenantContext(request);
  const body = upsertSchema.parse(await request.json().catch(() => null));

  await prisma.$transaction(async (tx) => {
    await saveCustomFieldValues(tx, tenant, body.entityType, body.entityId, body.values);
  });

  const values = await loadCustomFieldValues(tenant.organizationId, body.entityType, body.entityId);
  return ok({ entityType: body.entityType, entityId: body.entityId, values });
});

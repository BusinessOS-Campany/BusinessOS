import { requirePermission } from "@/core/db/tenant-guard";
import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";

import { updateEvent, deleteEvent, updateEventSchema } from "@/core/sama/calendar";

export const PUT = withRoute("v1.sama-center.calendar.update", async (request, context) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { appointments: ["update"] });

  const { id } = (context as { params: { id: string } }).params;
  const body = updateEventSchema.parse(await request.json().catch(() => null));
  const event = await updateEvent(
    // @ts-expect-error prisma tx handled internally
    null,
    tenant.organizationId,
    id,
    body,
  );
  return ok(event);
});

export const DELETE = withRoute("v1.sama-center.calendar.delete", async (request, context) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { appointments: ["delete"] });

  const { id } = (context as { params: { id: string } }).params;
  const result = await deleteEvent(
    // @ts-expect-error prisma tx handled internally
    null,
    tenant.organizationId,
    id,
  );
  return ok(result);
});

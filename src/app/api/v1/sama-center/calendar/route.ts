import { requirePermission } from "@/core/db/tenant-guard";
import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";

import { listEvents, createEvent, createEventSchema } from "@/core/sama/calendar";

export const GET = withRoute("v1.sama-center.calendar.list", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { appointments: ["read"] });

  const url = new URL(request.url);
  const dateFrom = url.searchParams.get("dateFrom") ?? undefined;
  const dateTo = url.searchParams.get("dateTo") ?? undefined;

  const result = await listEvents(tenant.organizationId, {
    from: dateFrom ? new Date(dateFrom) : undefined,
    to: dateTo ? new Date(dateTo) : undefined,
  });
  return ok(result);
});

export const POST = withRoute("v1.sama-center.calendar.create", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { appointments: ["create"] });

  const body = createEventSchema.parse(await request.json().catch(() => null));
  const event = await createEvent(
    // @ts-expect-error prisma tx handled internally
    null,
    tenant.organizationId,
    tenant.userId,
    body,
  );
  return ok({ id: event.id }, { status: 201 });
});

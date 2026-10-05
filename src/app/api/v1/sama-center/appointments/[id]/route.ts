import { requirePermission, requireModule } from "@/core/db/tenant-guard";
import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { getOrgSettings } from "@/core/tenancy/settings";

import {
  getAppointment,
  updateAppointment,
  deleteAppointment,
  updateAppointmentSchema,
} from "@/core/sama/appointments";

export const GET = withRoute("v1.sama-center.appointments.get", async (request, context) => {
  const { tenant } = await requireTenantContext(request);
  const settings = await getOrgSettings(tenant.organizationId);
  requireModule(settings, "appointments");
  requirePermission(tenant, { appointments: ["read"] });

  const { id } = (context as { params: { id: string } }).params;
  const appointment = await getAppointment(tenant.organizationId, id);
  return ok(appointment);
});

export const PUT = withRoute("v1.sama-center.appointments.update", async (request, context) => {
  const { tenant } = await requireTenantContext(request);
  const settings = await getOrgSettings(tenant.organizationId);
  requireModule(settings, "appointments");
  requirePermission(tenant, { appointments: ["update"] });

  const { id } = (context as { params: { id: string } }).params;
  const body = updateAppointmentSchema.parse(await request.json().catch(() => null));
  const appointment = await updateAppointment(
    // @ts-expect-error prisma tx handled internally
    null,
    tenant.organizationId,
    id,
    body,
  );
  return ok(appointment);
});

export const DELETE = withRoute("v1.sama-center.appointments.delete", async (request, context) => {
  const { tenant } = await requireTenantContext(request);
  const settings = await getOrgSettings(tenant.organizationId);
  requireModule(settings, "appointments");
  requirePermission(tenant, { appointments: ["delete"] });

  const { id } = (context as { params: { id: string } }).params;
  const result = await deleteAppointment(
    // @ts-expect-error prisma tx handled internally
    null,
    tenant.organizationId,
    id,
  );
  return ok(result);
});

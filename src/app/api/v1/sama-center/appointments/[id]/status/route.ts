import { requirePermission, requireModule } from "@/core/db/tenant-guard";
import { z } from "zod";
import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { getOrgSettings } from "@/core/tenancy/settings";

import { updateAppointmentStatus } from "@/core/sama/appointments";

const statusSchema = z.object({
  status: z.string().min(1),
});

export const PATCH = withRoute("v1.sama-center.appointments.status", async (request, context) => {
  const { tenant } = await requireTenantContext(request);
  const settings = await getOrgSettings(tenant.organizationId);
  requireModule(settings, "appointments");
  requirePermission(tenant, { appointments: ["update"] });

  const { id } = (context as { params: { id: string } }).params;
  const { status } = statusSchema.parse(await request.json().catch(() => null));

  const appointment = await updateAppointmentStatus(
    // @ts-expect-error prisma tx handled internally
    null,
    tenant.organizationId,
    id,
    status,
  );
  return ok(appointment);
});

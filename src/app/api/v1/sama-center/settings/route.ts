import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { requirePermission } from "@/core/db/tenant-guard";
import { getOrgSettings, updateOrgSettings } from "@/core/tenancy/settings";

const DEFAULTS = {
  general: {
    businessName: "",
    currency: "YER",
    timezone: "Asia/Riyadh",
  },
  clinic: {
    defaultAppointmentDuration: 30,
    workingHoursStart: "09:00",
    workingHoursEnd: "21:00",
    workingDays: ["sunday", "monday", "tuesday", "wednesday", "thursday", "saturday"],
  },
  notifications: {
    appointmentReminders: true,
    lowStockAlerts: true,
    dailyReportAlerts: false,
  },
};

export const GET = withRoute("v1.sama-center.settings.get", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { settings: ["read"] });

  const settings = await getOrgSettings(tenant.organizationId);
  const tag = (settings.samaCenter ?? {}) as Record<string, unknown>;

  const merge = <T>(defaults: T, patch: unknown): T =>
    ({ ...defaults, ...((patch ?? {}) as Partial<T>) }) as T;

  return ok({
    general: merge(DEFAULTS.general, tag.general),
    clinic: merge(DEFAULTS.clinic, tag.clinic),
    notifications: merge(DEFAULTS.notifications, tag.notifications),
  });
});

export const PUT = withRoute("v1.sama-center.settings.update", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { settings: ["manage"] });

  const body = (await request.json().catch(() => null)) ?? {};
  const current = await getOrgSettings(tenant.organizationId);
  const currentTag = (current.samaCenter ?? {}) as Record<string, unknown>;

  const merged = {
    general: body.general ?? currentTag.general ?? DEFAULTS.general,
    clinic: body.clinic ?? currentTag.clinic ?? DEFAULTS.clinic,
    notifications: body.notifications ?? currentTag.notifications ?? DEFAULTS.notifications,
  };

  await updateOrgSettings(tenant.organizationId, { samaCenter: merged });
  return ok(merged);
});
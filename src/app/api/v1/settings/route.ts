import { z } from "zod";
import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { requirePermission } from "@/core/db/tenant-guard";
import { getOrgSettings, updateOrgSettings } from "@/core/tenancy/settings";
import type { ModuleName } from "@/core/permissions/catalog";

const patchSchema = z.object({
  locale: z.enum(["ar", "en"]).optional(),
  branding: z
    .object({
      primary: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      radius: z.number().int().min(0).max(24),
      logoUrl: z.string().url().max(500),
      displayNameOverride: z.string().max(60),
    })
    .partial()
    .optional(),
  modulesEnabled: z.array(z.string()).max(32).optional(),
});

export const GET = withRoute("v1.settings.get", async (request) => {
  const { tenant } = await requireTenantContext(request);
  // Settings carry the org's custom domains and enabled-module list, so reading
  // them is a `settings:read` action rather than open to every member. Roles
  // that do not hold it get a 403 instead of the configuration.
  requirePermission(tenant, { settings: ["read"] });
  return ok({ settings: await getOrgSettings(tenant.organizationId) });
});

/** Tenant settings + appearance builder endpoint (controlled tokens only). */
export const PATCH = withRoute("v1.settings.patch", async (request) => {
  const { tenant } = await requireTenantContext(request);
  // Any write to tenant settings requires `settings:manage`. This used to be
  // conditional on the body containing `branding` or `modulesEnabled`, which
  // meant a bare `{ locale }` patch was accepted from any role including
  // `viewer` - a low-value hole, but a hole in an org-wide settings endpoint.
  requirePermission(tenant, { settings: ["manage"] });
  const body = patchSchema.parse(await request.json().catch(() => null));

  const settings = await updateOrgSettings(tenant.organizationId, {
    ...(body.locale ? { locale: body.locale } : {}),
    ...(body.branding ? { branding: body.branding } : {}),
    ...(body.modulesEnabled ? { modulesEnabled: body.modulesEnabled as ModuleName[] } : {}),
  });
  return ok({ settings });
});

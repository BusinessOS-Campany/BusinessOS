import { ApiError } from "@/core/http/api";
import type { TenantContext } from "@/core/tenancy/context";
import { isTenantRole, tenantRoles, type PermissionStatement } from "@/core/permissions/catalog";
import { isModuleEnabled, type OrgSettings } from "@/core/tenancy/settings";

/**
 * TenantGuard primitives. Every repository MUST route reads/writes through
 * these so an organizationId filter can never be forgotten.
 * (ARCHITECTURE.md §Layering rule 2.)
 */

/** Inject into every `where` clause of a tenant-scoped query. */
export function tenantFilter(
  tenant: Pick<TenantContext, "organizationId">,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  return { AND: [{ organizationId: tenant.organizationId }, ...(extra ? [extra] : [])] };
}

/** Value that must be set on INSERT of any tenant-owned row. */
export function tenantOwn(tenant: Pick<TenantContext, "organizationId">): { organizationId: string } {
  return { organizationId: tenant.organizationId };
}

/** Verifies a fetched row belongs to the caller's org (post-read defense). */
export function assertOwned(
  row: { organizationId: string | null } | null | undefined,
  tenant: Pick<TenantContext, "organizationId">,
): void {
  if (!row || row.organizationId !== tenant.organizationId) {
    throw ApiError.notFound();
  }
}

/** Checks `module.action` against the role's grants from the code catalog. */
export function hasPermission(
  role: string,
  statement: PermissionStatement,
): boolean {
  if (!isTenantRole(role)) return false;
  const result = tenantRoles[role].authorize(statement);
  return result.success;
}

/** hasPermission + canonical 403. */
export function requirePermission(
  tenant: Pick<TenantContext, "role">,
  statement: PermissionStatement,
): void {
  if (!hasPermission(tenant.role, statement)) {
    throw ApiError.forbidden();
  }
}

/** Module toggle gate (M3): disabled modules are invisible to nav AND API. */
export function requireModule(
  settings: OrgSettings,
  moduleName: Parameters<typeof isModuleEnabled>[1],
): void {
  if (!isModuleEnabled(settings, moduleName)) {
    throw new ApiError(404, "MODULE_DISABLED", "هذه الوحدة غير مفعّلة", "This module is not enabled");
  }
}

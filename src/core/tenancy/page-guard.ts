import { redirect } from "next/navigation";
import { hasPermission } from "@/core/db/tenant-guard";
import type { PermissionStatement } from "@/core/permissions/catalog";
import { getRenderSession, getRenderTenant } from "@/core/tenancy/request-context";
import type { TenantResolution } from "@/core/tenancy/context";

/**
 * Server-component variant of the tenant guard: redirects instead of throwing
 * API errors so RSC pages degrade gracefully.
 *
 * Reads go through the request-scoped helpers, so this shares the session and
 * tenant that the app layout already resolved for the same render instead of
 * paying for them again on every page.
 */
export async function requireTenantPage(
  permission?: PermissionStatement,
): Promise<TenantResolution> {
  const session = await getRenderSession();
  if (!session) redirect("/signin");

  const ctx = await getRenderTenant();
  if (!ctx) redirect("/select-org");

  if (permission && !hasPermission(ctx.tenant.role, permission)) {
    redirect("/app?denied=1");
  }
  return ctx;
}

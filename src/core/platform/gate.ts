import { auth } from "@/core/auth/server";
import { sharedPrisma } from "@/core/db/client";
import { ApiError } from "@/core/http/api";
import type { TenantResolution } from "@/core/tenancy/context";

/**
 * Platform realm gate: only user.role === "admin" (Better Auth admin plugin)
 * may touch /api/platform/* and the platform-admin console.
 */
export async function requirePlatformAdmin(request: Request): Promise<TenantResolution["user"]> {
  const result = await auth.api.getSession({ headers: request.headers });
  if (!result?.session) throw ApiError.unauthorized();
  if (result.user.role !== "admin") throw ApiError.forbidden("Platform admin access required");
  return result.user;
}

/** Org statuses that cut the tenant off from all tenant-scoped traffic. */
const UNUSABLE = new Set(["pending", "suspended", "cancelled", "rejected"]);

/**
 * Throws the canonical lifecycle error for an unusable org status, or returns
 * normally when the tenant may proceed. Split out from the loader so callers
 * that already have the org row (see `resolveTenantContext`) can reuse the same
 * rules without issuing a second query.
 */
export function assertOrganizationStatusUsable(status: string | null | undefined): void {
  if (!status) throw ApiError.forbidden("Organization not found");
  if (!UNUSABLE.has(status)) return;
  if (status === "pending") {
    throw new ApiError(
      403,
      "ORGANIZATION_PENDING",
      "حساب المؤسسة قيد المراجعة، سيتم تفعيله فور اعتماده",
      "This organization is pending review.",
    );
  }
  if (status === "rejected") {
    throw new ApiError(
      403,
      "ORGANIZATION_REJECTED",
      "تم رفض حساب المؤسسة، يرجى التواصل مع الدعم",
      "This organization was rejected.",
    );
  }
  throw new ApiError(
    402,
    "ORGANIZATION_SUSPENDED",
    "تم إيقاف حساب المؤسسة، يرجى التواصل مع الدعم",
    "This organization is suspended. Contact support.",
  );
}

/**
 * Loads the org's status and blocks unusable tenants (M2 lifecycle gate:
 * fresh signups are `pending` until the platform admin approves, then the org
 * goes `suspended` on payment failure / `rejected` on manual refusal).
 * Called by `resolveTenantContext` for every tenant-scoped API request.
 */
export async function assertOrganizationActive(organizationId: string): Promise<{ status: string }> {
  const org = await sharedPrisma.organization.findUnique({
    where: { id: organizationId },
    select: { status: true },
  });
  if (!org) throw ApiError.forbidden("Organization not found");
  assertOrganizationStatusUsable(org.status);
  return org;
}
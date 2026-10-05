import { requirePermission } from "@/core/db/tenant-guard";
import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";

import { updateCoverage, deleteCoverage, updateCoverageSchema } from "@/core/sama/coverages";

export const PUT = withRoute("v1.sama-center.coverages.update", async (request, context) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { appointments: ["update"] });

  const { id } = (context as { params: { id: string } }).params;
  const body = updateCoverageSchema.parse(await request.json().catch(() => null));
  const coverage = await updateCoverage(
    // @ts-expect-error prisma tx handled internally
    null,
    tenant.organizationId,
    id,
    body,
  );
  return ok(coverage);
});

export const DELETE = withRoute("v1.sama-center.coverages.delete", async (request, context) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { appointments: ["update"] });

  const { id } = (context as { params: { id: string } }).params;
  const result = await deleteCoverage(
    // @ts-expect-error prisma tx handled internally
    null,
    tenant.organizationId,
    id,
  );
  return ok(result);
});

import { requirePermission } from "@/core/db/tenant-guard";
import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";

import { listCoverages, createCoverage, createCoverageSchema } from "@/core/sama/coverages";

export const GET = withRoute("v1.sama-center.coverages.list", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { appointments: ["read"] });

  const url = new URL(request.url);
  const employeeName = url.searchParams.get("employeeName") ?? undefined;
  const month = url.searchParams.get("month") ?? undefined;
  const page = Number(url.searchParams.get("page") ?? 1);
  const pageSize = Number(url.searchParams.get("pageSize") ?? 20);

  const from = month ? new Date(`${month}-01`) : undefined;
  const to = month
    ? new Date(new Date(`${month}-01`).setMonth(new Date(`${month}-01`).getMonth() + 1))
    : undefined;

  const result = await listCoverages(tenant.organizationId, {
    employeeName,
    from,
    to,
    page,
    pageSize,
  });
  return ok(result);
});

export const POST = withRoute("v1.sama-center.coverages.create", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { appointments: ["create"] });

  const body = createCoverageSchema.parse(await request.json().catch(() => null));
  const coverage = await createCoverage(
    // @ts-expect-error prisma tx handled internally
    null,
    tenant.organizationId,
    tenant.userId,
    body,
  );
  return ok({ id: coverage.id }, { status: 201 });
});

import { requirePermission } from "@/core/db/tenant-guard";
import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";

import { listAdvances, createAdvance, createAdvanceSchema } from "@/core/sama/advances";

export const GET = withRoute("v1.sama-center.advances.list", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { finance: ["read"] });

  const url = new URL(request.url);
  const employeeName = url.searchParams.get("employeeName") ?? undefined;
  const page = Number(url.searchParams.get("page") ?? 1);
  const pageSize = Number(url.searchParams.get("pageSize") ?? 20);

  const result = await listAdvances(tenant.organizationId, { employeeName, page, pageSize });
  return ok(result);
});

export const POST = withRoute("v1.sama-center.advances.create", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { finance: ["manage"] });

  const body = createAdvanceSchema.parse(await request.json().catch(() => null));
  const advance = await createAdvance(
    // @ts-expect-error prisma tx handled internally
    null,
    tenant.organizationId,
    tenant.userId,
    body,
  );
  return ok({ id: advance.id }, { status: 201 });
});

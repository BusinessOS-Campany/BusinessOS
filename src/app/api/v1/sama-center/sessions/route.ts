import { requirePermission } from "@/core/db/tenant-guard";
import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";

import { listSessions, createSession, createSessionSchema } from "@/core/sama/sessions";

export const GET = withRoute("v1.sama-center.sessions.list", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { appointments: ["read"] });

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? undefined;
  const dateFrom = url.searchParams.get("dateFrom") ?? undefined;
  const dateTo = url.searchParams.get("dateTo") ?? undefined;
  const page = Number(url.searchParams.get("page") ?? 1);
  const pageSize = Number(url.searchParams.get("pageSize") ?? 20);

  const result = await listSessions(tenant.organizationId, {
    status,
    from: dateFrom ? new Date(dateFrom) : undefined,
    to: dateTo ? new Date(dateTo) : undefined,
    page,
    pageSize,
  });
  return ok(result);
});

export const POST = withRoute("v1.sama-center.sessions.create", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { appointments: ["create"] });

  const body = createSessionSchema.parse(await request.json().catch(() => null));
  const session = await createSession(
    // @ts-expect-error prisma tx handled internally
    null,
    tenant.organizationId,
    tenant.userId,
    body,
  );
  return ok({ id: session.id }, { status: 201 });
});

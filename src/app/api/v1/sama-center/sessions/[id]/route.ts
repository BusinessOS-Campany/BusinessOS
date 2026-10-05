import { requirePermission } from "@/core/db/tenant-guard";
import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";

import { getSession, updateSession, deleteSession, updateSessionSchema } from "@/core/sama/sessions";

export const GET = withRoute("v1.sama-center.sessions.get", async (request, context) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { appointments: ["read"] });

  const { id } = (context as { params: { id: string } }).params;
  const session = await getSession(tenant.organizationId, id);
  return ok(session);
});

export const PUT = withRoute("v1.sama-center.sessions.update", async (request, context) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { appointments: ["update"] });

  const { id } = (context as { params: { id: string } }).params;
  const body = updateSessionSchema.parse(await request.json().catch(() => null));
  const session = await updateSession(
    // @ts-expect-error prisma tx handled internally
    null,
    tenant.organizationId,
    id,
    body,
  );
  return ok(session);
});

export const DELETE = withRoute("v1.sama-center.sessions.delete", async (request, context) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { appointments: ["delete"] });

  const { id } = (context as { params: { id: string } }).params;
  const result = await deleteSession(
    // @ts-expect-error prisma tx handled internally
    null,
    tenant.organizationId,
    id,
  );
  return ok(result);
});

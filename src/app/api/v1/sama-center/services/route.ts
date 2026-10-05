import { requirePermission } from "@/core/db/tenant-guard";
import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";

import { listServices, createService, createServiceSchema } from "@/core/sama/services";

export const GET = withRoute("v1.sama-center.services.list", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { products: ["read"] });

  const services = await listServices(tenant.organizationId);
  return ok({ services });
});

export const POST = withRoute("v1.sama-center.services.create", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { products: ["create"] });

  const body = createServiceSchema.parse(await request.json().catch(() => null));
  const service = await createService(
    // @ts-expect-error prisma tx handled internally
    null,
    tenant.organizationId,
    tenant.userId,
    body,
  );
  return ok({ id: service.id }, { status: 201 });
});

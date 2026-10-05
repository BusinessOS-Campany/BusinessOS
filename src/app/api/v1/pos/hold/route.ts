import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { requireModule, requirePermission } from "@/core/db/tenant-guard";
import { getOrgSettings } from "@/core/tenancy/settings";
import { holdCart, listHolds, deleteHold } from "@/core/pos/service";
import { posHoldSchema } from "@/core/pos/types";
import { prisma } from "@/core/db/client";

export const GET = withRoute("v1.pos.holds.list", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requireModule(await getOrgSettings(tenant.organizationId), "sales");
  requirePermission(tenant, { sales: ["read"] });
  return ok(await listHolds(prisma, tenant));
});

export const POST = withRoute("v1.pos.holds.create", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requireModule(await getOrgSettings(tenant.organizationId), "sales");
  requirePermission(tenant, { sales: ["create"] });
  const body = posHoldSchema.parse(await request.json().catch(() => null));
  return ok(await holdCart(prisma, tenant, body), { status: 201 });
});

export const DELETE = withRoute("v1.pos.holds.delete", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requireModule(await getOrgSettings(tenant.organizationId), "sales");
  requirePermission(tenant, { sales: ["delete"] });
  const url = new URL(request.url);
  const holdId = url.searchParams.get("holdId");
  if (!holdId) throw new Error("holdId query param required");
  return ok(await deleteHold(prisma, tenant, holdId));
});

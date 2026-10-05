import { z } from "zod";
import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { requirePermission, tenantFilter, tenantOwn } from "@/core/db/tenant-guard";
import { prisma } from "@/core/db/client";

export const GET = withRoute("v1.warehouses.list", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { inventory: ["read"] });
  const rows = await prisma.warehouse.findMany({ where: tenantFilter(tenant) });
  return ok({ warehouses: rows });
});

export const POST = withRoute("v1.warehouses.create", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { settings: ["manage"] });
  const body = z
    .object({
      nameAr: z.string().min(1).max(120),
      nameEn: z.string().max(120).optional(),
      isMain: z.boolean().optional(),
    })
    .parse(await request.json().catch(() => null));
  if (body.isMain) {
    // Single main warehouse invariant.
    await prisma.warehouse.updateMany({
      where: tenantFilter(tenant, { isMain: true }),
      data: { isMain: false },
    });
  }
  const row = await prisma.warehouse.create({
    data: { ...tenantOwn(tenant), nameAr: body.nameAr, nameEn: body.nameEn, isMain: body.isMain },
  });
  return ok({ id: row.id }, { status: 201 });
});

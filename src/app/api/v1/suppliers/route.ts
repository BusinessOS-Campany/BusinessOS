import { z } from "zod";
import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { requirePermission, tenantFilter, tenantOwn } from "@/core/db/tenant-guard";
import { prisma } from "@/core/db/client";

export const GET = withRoute("v1.suppliers.list", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { suppliers: ["read"] });
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();
  const rows = await prisma.supplier.findMany({
    where: tenantFilter(tenant, {
      isActive: true,
      ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
    }),
    take: Math.min(Number(url.searchParams.get("limit") ?? 50), 100),
    orderBy: { createdAt: "desc" },
  });
  return ok({ suppliers: rows });
});

const createSchema = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().max(32).optional(),
  notes: z.string().max(500).optional(),
});

export const POST = withRoute("v1.suppliers.create", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { suppliers: ["create"] });
  const body = createSchema.parse(await request.json().catch(() => null));
  const row = await prisma.supplier.create({
    data: { ...tenantOwn(tenant), name: body.name, phone: body.phone, notes: body.notes },
  });
  return ok({ id: row.id }, { status: 201 });
});

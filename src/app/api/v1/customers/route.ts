import { z } from "zod";
import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { requirePermission, tenantFilter, tenantOwn } from "@/core/db/tenant-guard";
import { prisma } from "@/core/db/client";

export const GET = withRoute("v1.customers.list", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { customers: ["read"] });
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();
  const rows = await prisma.customer.findMany({
    where: tenantFilter(tenant, {
      isActive: true,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { phone: { contains: q } },
            ],
          }
        : {}),
    }),
    take: Math.min(Number(url.searchParams.get("limit") ?? 50), 100),
    orderBy: { createdAt: "desc" },
  });
  return ok({ customers: rows });
});

const createSchema = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().max(32).optional(),
  email: z.string().email().optional(),
  /** Minor units; 0 = cash-only customer. */
  creditLimit: z.number().int().min(0).optional(),
  notes: z.string().max(500).optional(),
});

export const POST = withRoute("v1.customers.create", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { customers: ["create"] });
  const body = createSchema.parse(await request.json().catch(() => null));
  const row = await prisma.customer.create({
    data: {
      ...tenantOwn(tenant),
      name: body.name,
      phone: body.phone,
      email: body.email,
      creditLimit: BigInt(body.creditLimit ?? 0),
      notes: body.notes,
    },
  });
  return ok({ id: row.id }, { status: 201 });
});

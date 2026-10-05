import { ok, withRoute, ApiError } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { requireModule, requirePermission } from "@/core/db/tenant-guard";
import { getOrgSettings } from "@/core/tenancy/settings";
import { prisma } from "@/core/db/client";

export const GET = withRoute("v1.grocery.suppliers.list", async (request) => {
  const { tenant } = await requireTenantContext(request);
  const settings = await getOrgSettings(tenant.organizationId);
  requireModule(settings, "suppliers");
  requirePermission(tenant, { suppliers: ["read"] });

  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim() ?? undefined;
  const page = Math.max(Number(url.searchParams.get("page") ?? 1), 1);
  const pageSize = Math.min(Number(url.searchParams.get("pageSize") ?? 20), 100);

  const where = {
    organizationId: tenant.organizationId,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { phone: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.supplier.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { name: "asc" as const },
      select: { id: true, name: true, phone: true, balance: true, isActive: true },
    }),
    prisma.supplier.count({ where }),
  ]);

  const items = rows.map((s) => ({
    id: s.id,
    code: s.id.slice(-6).toUpperCase(),
    name: s.name,
    phone: s.phone ?? "",
    email: "",
    balance: Number(s.balance),
    creditLimit: 0,
    isActive: s.isActive,
  }));

  return ok({ items, total });
});

export const POST = withRoute("v1.grocery.suppliers.create", async (request) => {
  const { tenant } = await requireTenantContext(request);
  const settings = await getOrgSettings(tenant.organizationId);
  requireModule(settings, "suppliers");
  requirePermission(tenant, { suppliers: ["create"] });

  const body = await request.json().catch(() => null);
  if (!body?.name) throw ApiError.badRequest("Supplier name is required");

  const supplier = await prisma.supplier.create({
    data: {
      organizationId: tenant.organizationId,
      name: body.name,
      phone: body.phone ?? null,
    },
  });
  return ok(supplier, { status: 201 });
});
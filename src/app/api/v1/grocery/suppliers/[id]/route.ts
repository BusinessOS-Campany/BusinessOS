import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { requirePermission } from "@/core/db/tenant-guard";
import { prisma } from "@/core/db/client";
import { ApiError } from "@/core/http/api";

export const PUT = withRoute<{ params: Promise<{ id: string }> }>(
  "v1.grocery.suppliers.update",
  async (request, { params }) => {
    const { tenant } = await requireTenantContext(request);
    requirePermission(tenant, { suppliers: ["update"] });

    const { id } = await params;
    const body = (await request.json().catch(() => null)) ?? {};

    const existing = await prisma.supplier.findFirst({
      where: { id, organizationId: tenant.organizationId },
    });
    if (!existing) throw ApiError.notFound("Supplier not found");

    const supplier = await prisma.supplier.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.phone !== undefined && { phone: body.phone || null }),
      },
    });
    return ok(supplier);
  },
);

export const DELETE = withRoute<{ params: Promise<{ id: string }> }>(
  "v1.grocery.suppliers.delete",
  async (request, { params }) => {
    const { tenant } = await requireTenantContext(request);
    requirePermission(tenant, { suppliers: ["delete"] });

    const { id } = await params;
    const existing = await prisma.supplier.findFirst({
      where: { id, organizationId: tenant.organizationId },
    });
    if (!existing) throw ApiError.notFound("Supplier not found");

    const supplier = await prisma.supplier.update({
      where: { id },
      data: { isActive: false },
    });
    return ok({ deleted: true, id: supplier.id });
  },
);
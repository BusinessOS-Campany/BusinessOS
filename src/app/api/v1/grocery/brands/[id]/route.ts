import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { requirePermission } from "@/core/db/tenant-guard";
import { deleteBrand, updateBrand } from "@/core/grocery/brands";
import { prisma } from "@/core/db/client";

export const PUT = withRoute<{ params: Promise<{ id: string }> }>(
  "v1.grocery.brands.update",
  async (request, { params }) => {
    const { tenant } = await requireTenantContext(request);
    requirePermission(tenant, { products: ["update"] });

    const { id } = await params;
    const body = await request.json().catch(() => null);
    const brand = await updateBrand(prisma, tenant.organizationId, id, {
      name: body?.nameAr,
      nameAr: body?.nameAr,
    });
    return ok(brand);
  },
);

export const DELETE = withRoute<{ params: Promise<{ id: string }> }>(
  "v1.grocery.brands.delete",
  async (request, { params }) => {
    const { tenant } = await requireTenantContext(request);
    requirePermission(tenant, { products: ["delete"] });

    const { id } = await params;
    return ok(await deleteBrand(prisma, tenant.organizationId, id));
  },
);
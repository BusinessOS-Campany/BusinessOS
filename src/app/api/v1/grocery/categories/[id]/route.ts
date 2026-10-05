import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { requirePermission } from "@/core/db/tenant-guard";
import { deleteCategory, updateCategory } from "@/core/grocery/inventory-mgmt";
import { prisma } from "@/core/db/client";

export const PUT = withRoute<{ params: Promise<{ id: string }> }>(
  "v1.grocery.categories.update",
  async (request, { params }) => {
    const { tenant } = await requireTenantContext(request);
    requirePermission(tenant, { products: ["update"] });

    const { id } = await params;
    const body = await request.json().catch(() => null);
    const category = await updateCategory(prisma, tenant.organizationId, id, {
      parentId: body?.parentId === null ? null : body?.parentId || undefined,
      nameAr: body?.nameAr,
      nameEn: body?.nameEn,
      sortOrder: body?.sortOrder,
    });
    return ok(category);
  },
);

export const DELETE = withRoute<{ params: Promise<{ id: string }> }>(
  "v1.grocery.categories.delete",
  async (request, { params }) => {
    const { tenant } = await requireTenantContext(request);
    requirePermission(tenant, { products: ["delete"] });

    const { id } = await params;
    return ok(await deleteCategory(prisma, tenant.organizationId, id));
  },
);
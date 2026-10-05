import { z } from "zod";
import { ApiError, ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { requireModule, requirePermission, tenantFilter } from "@/core/db/tenant-guard";
import { getOrgSettings } from "@/core/tenancy/settings";
import { prisma } from "@/core/db/client";
import { writeAuditLog } from "@/core/audit/service";

export const GET = withRoute("v1.products.list", async (request) => {
  const { tenant } = await requireTenantContext(request);
  const settings = await getOrgSettings(tenant.organizationId);
  requireModule(settings, "products");
  requirePermission(tenant, { products: ["read"] });

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 100);

  const products = await prisma.product.findMany({
    where: tenantFilter(tenant, {
      isActive: true,
      ...(q ? { OR: [{ sku: { contains: q, mode: "insensitive" } }, { nameAr: { contains: q } }, { barcode: q }] } : {}),
    }),
    select: {
      id: true,
      sku: true,
      barcode: true,
      nameAr: true,
      nameEn: true,
      salePrice: true,
      costPrice: true,
      taxRateBps: true,
      trackStock: true,
      minStock: true,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return ok({ products });
});

const createSchema = z.object({
  sku: z.string().min(1).max(64),
  barcode: z.string().min(1).max(64).optional(),
  nameAr: z.string().min(1).max(200),
  nameEn: z.string().max(200).optional(),
  categoryId: z.string().optional(),
  costPrice: z.number().int().min(0),
  salePrice: z.number().int().min(0),
  wholesalePrice: z.number().int().min(0).optional(),
  taxRateBps: z.number().int().min(0).max(10000).default(0),
  trackStock: z.boolean().default(true),
  minStock: z.number().nonnegative().optional(),
});

export const POST = withRoute("v1.products.create", async (request) => {
  const { tenant } = await requireTenantContext(request);
  const settings = await getOrgSettings(tenant.organizationId);
  requireModule(settings, "products");
  requirePermission(tenant, { products: ["create"] });
  const body = createSchema.parse(await request.json().catch(() => null));

  try {
    const product = await prisma.$transaction(async (tx) => {
      const p = await tx.product.create({
        data: {
          organizationId: tenant.organizationId,
          sku: body.sku,
          barcode: body.barcode,
          nameAr: body.nameAr,
          nameEn: body.nameEn,
          categoryId: body.categoryId,
          costPrice: BigInt(body.costPrice),
          salePrice: BigInt(body.salePrice),
          wholesalePrice: body.wholesalePrice !== undefined ? BigInt(body.wholesalePrice) : undefined,
          taxRateBps: body.taxRateBps,
          trackStock: body.trackStock,
          minStock: body.minStock,
        },
      });
      await writeAuditLog(tx, tenant, {
        action: "product.created",
        entityType: "product",
        entityId: p.id,
        after: { sku: p.sku, nameAr: p.nameAr },
      });
      return p;
    });
    return ok({ product: { id: product.id, sku: product.sku } }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && /unique/i.test(err.message)) {
      throw ApiError.conflict("SKU or barcode already exists", { fieldHint: "sku|barcode" });
    }
    throw err;
  }
});


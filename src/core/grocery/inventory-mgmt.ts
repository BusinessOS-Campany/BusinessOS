import { z } from "zod";
import type { Prisma, PrismaClient } from "@/core/db/generated/prisma/client";
import { prisma } from "@/core/db/client";
import { ApiError } from "@/core/http/api";
import { writeAuditLog } from "@/core/audit/service";
import { applyStockMovement } from "@/core/inventory/service";
import { nextNumber } from "@/core/seq/service";

// ── Product Schemas ───────────────────────────────────────────────────────────

export const createProductSchema = z.object({
  categoryId: z.string().min(1).optional(),
  baseUnitId: z.string().min(1).optional(),
  sku: z.string().min(1).max(100),
  barcode: z.string().max(100).optional(),
  nameAr: z.string().min(1).max(300),
  nameEn: z.string().max(300).optional(),
  costPrice: z.number().int().min(0),
  salePrice: z.number().int().min(0),
  wholesalePrice: z.number().int().min(0).optional(),
  taxRateBps: z.number().int().min(0).max(10000).optional(),
  trackStock: z.boolean().optional(),
  minStock: z.number().min(0).optional(),
  initialStock: z.number().min(0).optional(),
  warehouseId: z.string().min(1).optional(),
});

export const updateProductSchema = z.object({
  categoryId: z.string().min(1).nullable().optional(),
  baseUnitId: z.string().min(1).nullable().optional(),
  sku: z.string().min(1).max(100).optional(),
  barcode: z.string().max(100).optional(),
  nameAr: z.string().min(1).max(300).optional(),
  nameEn: z.string().max(300).optional(),
  costPrice: z.number().int().min(0).optional(),
  salePrice: z.number().int().min(0).optional(),
  wholesalePrice: z.number().int().min(0).nullable().optional(),
  taxRateBps: z.number().int().min(0).max(10000).optional(),
  trackStock: z.boolean().optional(),
  minStock: z.number().min(0).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const createCategorySchema = z.object({
  parentId: z.string().min(1).optional(),
  nameAr: z.string().min(1).max(200),
  nameEn: z.string().max(200).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const updateCategorySchema = z.object({
  parentId: z.string().min(1).nullable().optional(),
  nameAr: z.string().min(1).max(200).optional(),
  nameEn: z.string().max(200).optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export const createAdjustmentSchema = z.object({
  productId: z.string().min(1),
  warehouseId: z.string().min(1),
  type: z.enum(["increase", "decrease"]),
  quantity: z.number().positive(),
  reason: z.string().min(1).max(500),
  note: z.string().max(500).optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CreateAdjustmentInput = z.infer<typeof createAdjustmentSchema>;

// ── List Options ──────────────────────────────────────────────────────────────

export interface ListProductsOpts {
  search?: string;
  categoryId?: string;
  isActive?: boolean;
  trackStock?: boolean;
  page?: number;
  pageSize?: number;
}

export interface ListStockOpts {
  warehouseId?: string;
  productId?: string;
  page?: number;
  pageSize?: number;
}

export interface ListMovementsOpts {
  productId?: string;
  warehouseId?: string;
  reason?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
}

// ── Product CRUD ──────────────────────────────────────────────────────────────

export async function listProducts(organizationId: string, opts?: ListProductsOpts) {
  const page = opts?.page ?? 1;
  const pageSize = opts?.pageSize ?? 20;
  const skip = (page - 1) * pageSize;

  const where: Prisma.productWhereInput = { organizationId };
  if (opts?.isActive !== undefined) where.isActive = opts.isActive;
  if (opts?.categoryId) where.categoryId = opts.categoryId;
  if (opts?.trackStock !== undefined) where.trackStock = opts.trackStock;
  if (opts?.search) {
    where.OR = [
      { nameAr: { contains: opts.search, mode: "insensitive" } },
      { nameEn: { contains: opts.search, mode: "insensitive" } },
      { sku: { contains: opts.search, mode: "insensitive" } },
      { barcode: { contains: opts.search, mode: "insensitive" } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { nameAr: "asc" },
    }),
    prisma.product.count({ where }),
  ]);

  const categoryIds = [...new Set(rows.map((r) => r.categoryId).filter(Boolean))] as string[];
  const categories = categoryIds.length
    ? await prisma.category.findMany({
        where: { organizationId, id: { in: categoryIds } },
        select: { id: true, nameAr: true },
      })
    : [];
  const catMap = new Map(categories.map((c) => [c.id, c.nameAr]));

  const enriched = rows.map((r) => ({
    ...r,
    categoryName: r.categoryId ? catMap.get(r.categoryId) ?? null : null,
  }));

  return { rows: enriched, total, page, pageSize };
}

export async function getProduct(organizationId: string, id: string) {
  const product = await prisma.product.findFirst({
    where: { id, organizationId },
  });
  if (!product) throw ApiError.notFound("Product not found");

  const [category, stockLevels] = await Promise.all([
    product.categoryId
      ? prisma.category.findFirst({
          where: { id: product.categoryId, organizationId },
          select: { id: true, nameAr: true, nameEn: true },
        })
      : null,
    prisma.stockLevel.findMany({
      where: { organizationId, productId: id },
    }),
  ]);

  const warehouseIds = [...new Set(stockLevels.map((s) => s.warehouseId))];
  const warehouses = warehouseIds.length
    ? await prisma.warehouse.findMany({
        where: { organizationId, id: { in: warehouseIds } },
        select: { id: true, nameAr: true },
      })
    : [];
  const whMap = new Map(warehouses.map((w) => [w.id, w.nameAr]));

  const enrichedStock = stockLevels.map((s) => ({
    ...s,
    warehouseName: whMap.get(s.warehouseId) ?? "N/A",
  }));

  return { ...product, category, stockLevels: enrichedStock };
}

export async function createProduct(
  tx: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  userId: string,
  data: CreateProductInput,
) {
  const parsed = createProductSchema.parse(data);

  const existingSku = await tx.product.findFirst({
    where: { organizationId, sku: parsed.sku },
    select: { id: true },
  });
  if (existingSku) throw ApiError.conflict("SKU already exists");

  if (parsed.barcode) {
    const existingBarcode = await tx.product.findFirst({
      where: { organizationId, barcode: parsed.barcode },
      select: { id: true },
    });
    if (existingBarcode) throw ApiError.conflict("Barcode already exists");
  }

  if (parsed.categoryId) {
    const cat = await tx.category.findFirst({
      where: { id: parsed.categoryId, organizationId },
      select: { id: true },
    });
    if (!cat) throw ApiError.notFound("Category not found");
  }

  if (parsed.baseUnitId) {
    const unit = await tx.unit.findFirst({
      where: { id: parsed.baseUnitId, organizationId },
      select: { id: true },
    });
    if (!unit) throw ApiError.notFound("Unit not found");
  }

  const product = await tx.product.create({
    data: {
      organizationId,
      categoryId: parsed.categoryId,
      baseUnitId: parsed.baseUnitId,
      sku: parsed.sku,
      barcode: parsed.barcode,
      nameAr: parsed.nameAr,
      nameEn: parsed.nameEn,
      costPrice: BigInt(parsed.costPrice),
      salePrice: BigInt(parsed.salePrice),
      wholesalePrice: parsed.wholesalePrice ? BigInt(parsed.wholesalePrice) : null,
      taxRateBps: parsed.taxRateBps ?? 0,
      trackStock: parsed.trackStock ?? true,
      minStock: parsed.minStock,
    },
  });

  if (parsed.initialStock && parsed.warehouseId && parsed.trackStock !== false) {
    const warehouse = await tx.warehouse.findFirst({
      where: { id: parsed.warehouseId, organizationId },
      select: { id: true },
    });
    if (warehouse) {
      await applyStockMovement(tx, { organizationId, userId }, {
        productId: product.id,
        warehouseId: warehouse.id,
        qtyDelta: parsed.initialStock,
        reason: "adjustment",
        note: "Initial stock",
      });
    }
  }

  await writeAuditLog(tx, { organizationId }, {
    action: "product.created",
    entityType: "product",
    entityId: product.id,
    after: { sku: product.sku, nameAr: product.nameAr },
  });

  return product;
}

export async function updateProduct(
  tx: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  id: string,
  data: UpdateProductInput,
) {
  const parsed = updateProductSchema.parse(data);

  const existing = await tx.product.findFirst({
    where: { id, organizationId },
  });
  if (!existing) throw ApiError.notFound("Product not found");

  if (parsed.sku && parsed.sku !== existing.sku) {
    const dup = await tx.product.findFirst({
      where: { organizationId, sku: parsed.sku, id: { not: id } },
    });
    if (dup) throw ApiError.conflict("SKU already exists");
  }

  if (parsed.barcode && parsed.barcode !== existing.barcode) {
    const dup = await tx.product.findFirst({
      where: { organizationId, barcode: parsed.barcode, id: { not: id } },
    });
    if (dup) throw ApiError.conflict("Barcode already exists");
  }

  const product = await tx.product.update({
    where: { id },
    data: {
      ...(parsed.categoryId !== undefined && { categoryId: parsed.categoryId }),
      ...(parsed.baseUnitId !== undefined && { baseUnitId: parsed.baseUnitId }),
      ...(parsed.sku !== undefined && { sku: parsed.sku }),
      ...(parsed.barcode !== undefined && { barcode: parsed.barcode }),
      ...(parsed.nameAr !== undefined && { nameAr: parsed.nameAr }),
      ...(parsed.nameEn !== undefined && { nameEn: parsed.nameEn }),
      ...(parsed.costPrice !== undefined && { costPrice: BigInt(parsed.costPrice) }),
      ...(parsed.salePrice !== undefined && { salePrice: BigInt(parsed.salePrice) }),
      ...(parsed.wholesalePrice !== undefined && {
        wholesalePrice: parsed.wholesalePrice !== null ? BigInt(parsed.wholesalePrice) : null,
      }),
      ...(parsed.taxRateBps !== undefined && { taxRateBps: parsed.taxRateBps }),
      ...(parsed.trackStock !== undefined && { trackStock: parsed.trackStock }),
      ...(parsed.minStock !== undefined && { minStock: parsed.minStock }),
      ...(parsed.isActive !== undefined && { isActive: parsed.isActive }),
    },
  });

  await writeAuditLog(tx, { organizationId }, {
    action: "product.updated",
    entityType: "product",
    entityId: id,
    after: parsed,
  });

  return product;
}

export async function deleteProduct(
  tx: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  id: string,
) {
  const product = await tx.product.findFirst({
    where: { id, organizationId },
  });
  if (!product) throw ApiError.notFound("Product not found");

  const saleCount = await tx.salesInvoiceItem.count({
    where: { organizationId, productId: id },
  });
  if (saleCount > 0) {
    throw ApiError.badRequest(
      "Cannot delete product with sales history. Deactivate instead.",
    );
  }

  await tx.product.update({
    where: { id },
    data: { isActive: false },
  });

  await writeAuditLog(tx, { organizationId }, {
    action: "product.deleted",
    entityType: "product",
    entityId: id,
    before: { sku: product.sku, nameAr: product.nameAr },
  });

  return { deleted: true };
}

// ── Category CRUD ─────────────────────────────────────────────────────────────

export async function listCategories(organizationId: string) {
  const categories = await prisma.category.findMany({
    where: { organizationId },
    orderBy: { sortOrder: "asc" },
  });

  const productCounts = await prisma.product.groupBy({
    by: ["categoryId"],
    where: { organizationId, isActive: true },
    _count: { _all: true },
  });
  const countMap = new Map(
    productCounts
      .filter((g) => g.categoryId !== null)
      .map((g) => [g.categoryId!, g._count._all]),
  );

  return categories.map((cat) => ({
    ...cat,
    productCount: countMap.get(cat.id) ?? 0,
  }));
}

export async function createCategory(
  tx: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  data: CreateCategoryInput,
) {
  const parsed = createCategorySchema.parse(data);

  if (parsed.parentId) {
    const parent = await tx.category.findFirst({
      where: { id: parsed.parentId, organizationId },
    });
    if (!parent) throw ApiError.notFound("Parent category not found");
  }

  const category = await tx.category.create({
    data: {
      organizationId,
      parentId: parsed.parentId,
      nameAr: parsed.nameAr,
      nameEn: parsed.nameEn,
      sortOrder: parsed.sortOrder ?? 0,
    },
  });

  await writeAuditLog(tx, { organizationId }, {
    action: "category.created",
    entityType: "category",
    entityId: category.id,
    after: { nameAr: category.nameAr },
  });

  return category;
}

export async function updateCategory(
  tx: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  id: string,
  data: UpdateCategoryInput,
) {
  const parsed = updateCategorySchema.parse(data);

  const existing = await tx.category.findFirst({
    where: { id, organizationId },
  });
  if (!existing) throw ApiError.notFound("Category not found");

  if (parsed.parentId !== undefined) {
    if (parsed.parentId === id) {
      throw ApiError.badRequest("Category cannot be its own parent");
    }
    if (parsed.parentId) {
      const parent = await tx.category.findFirst({
        where: { id: parsed.parentId, organizationId },
      });
      if (!parent) throw ApiError.notFound("Parent category not found");

      const cycle = await detectCycle(tx, organizationId, id, parsed.parentId);
      if (cycle) throw ApiError.badRequest("Category cycle detected");
    }
  }

  const category = await tx.category.update({
    where: { id },
    data: {
      ...(parsed.parentId !== undefined && { parentId: parsed.parentId }),
      ...(parsed.nameAr !== undefined && { nameAr: parsed.nameAr }),
      ...(parsed.nameEn !== undefined && { nameEn: parsed.nameEn }),
      ...(parsed.sortOrder !== undefined && { sortOrder: parsed.sortOrder }),
      ...(parsed.isActive !== undefined && { isActive: parsed.isActive }),
    },
  });

  await writeAuditLog(tx, { organizationId }, {
    action: "category.updated",
    entityType: "category",
    entityId: id,
    after: parsed,
  });

  return category;
}

export async function deleteCategory(
  tx: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  id: string,
) {
  const category = await tx.category.findFirst({
    where: { id, organizationId },
  });
  if (!category) throw ApiError.notFound("Category not found");

  const childCount = await tx.category.count({
    where: { organizationId, parentId: id },
  });
  if (childCount > 0) {
    throw ApiError.badRequest(
      "Cannot delete category with child categories. Remove children first.",
    );
  }

  const productCount = await tx.product.count({
    where: { organizationId, categoryId: id, isActive: true },
  });
  if (productCount > 0) {
    throw ApiError.badRequest(
      "Cannot delete category with active products. Reassign products first.",
    );
  }

  await tx.category.delete({ where: { id } });

  await writeAuditLog(tx, { organizationId }, {
    action: "category.deleted",
    entityType: "category",
    entityId: id,
    before: { nameAr: category.nameAr },
  });

  return { deleted: true };
}

// ── Stock Queries ─────────────────────────────────────────────────────────────

export async function listStock(organizationId: string, opts?: ListStockOpts) {
  const page = opts?.page ?? 1;
  const pageSize = opts?.pageSize ?? 20;
  const skip = (page - 1) * pageSize;

  const where: Prisma.stockLevelWhereInput = { organizationId };
  if (opts?.warehouseId) where.warehouseId = opts.warehouseId;
  if (opts?.productId) where.productId = opts.productId;

  const [rows, total] = await Promise.all([
    prisma.stockLevel.findMany({
      where,
      skip,
      take: pageSize,
    }),
    prisma.stockLevel.count({ where }),
  ]);

  const productIds = [...new Set(rows.map((r) => r.productId))];
  const warehouseIds = [...new Set(rows.map((r) => r.warehouseId))];

  const [products, warehouses] = await Promise.all([
    productIds.length
      ? prisma.product.findMany({
          where: { organizationId, id: { in: productIds } },
          select: {
            id: true,
            sku: true,
            nameAr: true,
            costPrice: true,
            salePrice: true,
            minStock: true,
            trackStock: true,
          },
        })
      : [],
    warehouseIds.length
      ? prisma.warehouse.findMany({
          where: { organizationId, id: { in: warehouseIds } },
          select: { id: true, nameAr: true },
        })
      : [],
  ]);

  const productMap = new Map(products.map((p) => [p.id, p]));
  const warehouseMap = new Map(warehouses.map((w) => [w.id, w.nameAr]));

  const enriched = rows.map((r) => ({
    ...r,
    product: productMap.get(r.productId) ?? null,
    warehouse: warehouseMap.get(r.warehouseId) ?? "N/A",
  }));

  return { rows: enriched, total, page, pageSize };
}

export async function listLowStock(organizationId: string, limit?: number) {
  const products = await prisma.product.findMany({
    where: {
      organizationId,
      isActive: true,
      trackStock: true,
      minStock: { not: null },
    },
  });

  const ids = products.map((p) => p.id);
  if (ids.length === 0) return [];

  const sums = await prisma.stockLevel.groupBy({
    by: ["productId"],
    where: { organizationId, productId: { in: ids } },
    _sum: { qty: true },
  });
  const qtyById = new Map(
    sums.map((s) => [s.productId, s._sum.qty ? Number(s._sum.qty) : 0]),
  );

  const lowStock = [];
  for (const product of products) {
    if (!product.minStock) continue;

    const totalQty = qtyById.get(product.id) ?? 0;

    if (totalQty <= Number(product.minStock)) {
      lowStock.push({
        productId: product.id,
        sku: product.sku,
        nameAr: product.nameAr,
        currentQty: totalQty,
        minStock: Number(product.minStock),
      });
    }
  }

  lowStock.sort((a, b) => a.currentQty - b.currentQty);
  return limit ? lowStock.slice(0, limit) : lowStock;
}

export async function listMovements(organizationId: string, opts?: ListMovementsOpts) {
  const page = opts?.page ?? 1;
  const pageSize = opts?.pageSize ?? 20;
  const skip = (page - 1) * pageSize;

  const where: Prisma.stockMovementWhereInput = { organizationId };
  if (opts?.productId) where.productId = opts.productId;
  if (opts?.warehouseId) where.warehouseId = opts.warehouseId;
  if (opts?.reason) where.reason = opts.reason;
  if (opts?.from || opts?.to) {
    where.createdAt = {
      ...(opts.from && { gte: opts.from }),
      ...(opts.to && { lte: opts.to }),
    };
  }

  const [rows, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: "desc" },
    }),
    prisma.stockMovement.count({ where }),
  ]);

  const productIds = [...new Set(rows.map((r) => r.productId))];
  const warehouseIds = [...new Set(rows.map((r) => r.warehouseId))];

  const [products, warehouses] = await Promise.all([
    productIds.length
      ? prisma.product.findMany({
          where: { organizationId, id: { in: productIds } },
          select: { id: true, sku: true, nameAr: true },
        })
      : [],
    warehouseIds.length
      ? prisma.warehouse.findMany({
          where: { organizationId, id: { in: warehouseIds } },
          select: { id: true, nameAr: true },
        })
      : [],
  ]);

  const productMap = new Map(products.map((p) => [p.id, p]));
  const warehouseMap = new Map(warehouses.map((w) => [w.id, w.nameAr]));

  const enriched = rows.map((r) => ({
    ...r,
    product: productMap.get(r.productId) ?? null,
    warehouse: warehouseMap.get(r.warehouseId) ?? "N/A",
  }));

  return { rows: enriched, total, page, pageSize };
}

export async function createAdjustment(
  tx: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  userId: string,
  data: CreateAdjustmentInput,
) {
  const parsed = createAdjustmentSchema.parse(data);

  const product = await tx.product.findFirst({
    where: { id: parsed.productId, organizationId },
  });
  if (!product) throw ApiError.notFound("Product not found");

  const warehouse = await tx.warehouse.findFirst({
    where: { id: parsed.warehouseId, organizationId },
  });
  if (!warehouse) throw ApiError.notFound("Warehouse not found");

  const currentLevel = await tx.stockLevel.findFirst({
    where: {
      productId: parsed.productId,
      warehouseId: parsed.warehouseId,
    },
  });
  const previousQuantity = currentLevel ? Number(currentLevel.qty) : 0;

  const qtyDelta = parsed.type === "increase" ? parsed.quantity : -parsed.quantity;
  const newQuantity = previousQuantity + qtyDelta;

  const adjustmentNumber = await nextNumber(tx, organizationId, "expense", {
    prefix: "ADJ-",
    padding: 5,
  });

  await tx.stockAdjustment.create({
    data: {
      organizationId,
      adjustmentNumber,
      productId: parsed.productId,
      type: parsed.type,
      quantity: parsed.quantity,
      previousQuantity,
      newQuantity,
      reason: parsed.reason,
      note: parsed.note,
      createdByUserId: userId,
    },
  });

  await applyStockMovement(tx, { organizationId, userId }, {
    productId: parsed.productId,
    warehouseId: parsed.warehouseId,
    qtyDelta,
    reason: "adjustment",
    note: parsed.reason,
  });

  await writeAuditLog(tx, { organizationId }, {
    action: "stock.adjustment",
    entityType: "stock_adjustment",
    entityId: adjustmentNumber,
    after: {
      productId: parsed.productId,
      type: parsed.type,
      quantity: parsed.quantity,
      previousQuantity,
      newQuantity,
    },
  });

  return { adjustmentNumber, previousQuantity, newQuantity };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function detectCycle(
  tx: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  categoryId: string,
  potentialParentId: string,
): Promise<boolean> {
  let currentId: string | null = potentialParentId;
  const visited = new Set<string>([categoryId]);

  while (currentId) {
    if (visited.has(currentId)) return true;
    visited.add(currentId);

    const parentId: string | null = (
      await tx.category.findFirst({
        where: { id: currentId, organizationId },
        select: { parentId: true },
      })
    )?.parentId ?? null;
    currentId = parentId;
  }

  return false;
}

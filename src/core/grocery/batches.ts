import { z } from "zod";
import type { Prisma, PrismaClient } from "@/core/db/generated/prisma/client";
import { prisma } from "@/core/db/client";
import { ApiError } from "@/core/http/api";
import { writeAuditLog } from "@/core/audit/service";

export const createBatchSchema = z.object({
  productId: z.string().min(1),
  batchNo: z.string().min(1).max(100),
  mfgDate: z.coerce.date().optional(),
  expiryDate: z.coerce.date().optional(),
  quantity: z.number().min(0).max(1_000_000),
  costPrice: z.number().int().min(0).optional(),
  supplierId: z.string().min(1).optional(),
});

export const updateBatchSchema = z.object({
  batchNo: z.string().min(1).max(100).optional(),
  mfgDate: z.coerce.date().optional(),
  expiryDate: z.coerce.date().optional(),
  quantity: z.number().min(0).max(1_000_000).optional(),
  costPrice: z.number().int().min(0).optional(),
  supplierId: z.string().min(1).optional(),
});

export type CreateBatchInput = z.infer<typeof createBatchSchema>;
export type UpdateBatchInput = z.infer<typeof updateBatchSchema>;

export async function listBatches(organizationId: string, productId: string) {
  const product = await prisma.product.findFirst({
    where: { id: productId, organizationId },
    select: { id: true },
  });
  if (!product) throw ApiError.notFound("Product not found");

  const batches = await prisma.productBatch.findMany({
    where: { organizationId, productId },
    orderBy: { expiryDate: "asc" },
  });

  return batches;
}

export async function createBatch(
  tx: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  data: CreateBatchInput,
) {
  const parsed = createBatchSchema.parse(data);

  const product = await tx.product.findFirst({
    where: { id: parsed.productId, organizationId },
    select: { id: true, sku: true },
  });
  if (!product) throw ApiError.notFound("Product not found");

  if (parsed.supplierId) {
    const supplier = await tx.supplier.findFirst({
      where: { id: parsed.supplierId, organizationId },
      select: { id: true },
    });
    if (!supplier) throw ApiError.notFound("Supplier not found");
  }

  const existing = await tx.productBatch.findFirst({
    where: {
      organizationId,
      productId: parsed.productId,
      batchNo: parsed.batchNo,
    },
  });
  if (existing) throw ApiError.conflict("Batch number already exists for this product");

  const batch = await tx.productBatch.create({
    data: {
      organizationId,
      productId: parsed.productId,
      batchNo: parsed.batchNo,
      mfgDate: parsed.mfgDate,
      expiryDate: parsed.expiryDate,
      quantity: parsed.quantity,
      costPrice: parsed.costPrice ? BigInt(parsed.costPrice) : 0n,
      supplierId: parsed.supplierId,
    },
  });

  await writeAuditLog(tx, { organizationId }, {
    action: "batch.created",
    entityType: "product_batch",
    entityId: batch.id,
    after: {
      productId: parsed.productId,
      batchNo: parsed.batchNo,
      quantity: parsed.quantity,
    },
  });

  return batch;
}

export async function updateBatch(
  tx: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  id: string,
  data: UpdateBatchInput,
) {
  const parsed = updateBatchSchema.parse(data);

  const existing = await tx.productBatch.findFirst({
    where: { id, organizationId },
  });
  if (!existing) throw ApiError.notFound("Batch not found");

  if (parsed.batchNo && parsed.batchNo !== existing.batchNo) {
    const duplicate = await tx.productBatch.findFirst({
      where: {
        organizationId,
        productId: existing.productId,
        batchNo: parsed.batchNo,
        id: { not: id },
      },
    });
    if (duplicate) throw ApiError.conflict("Batch number already exists for this product");
  }

  const batch = await tx.productBatch.update({
    where: { id },
    data: {
      ...(parsed.batchNo !== undefined && { batchNo: parsed.batchNo }),
      ...(parsed.mfgDate !== undefined && { mfgDate: parsed.mfgDate }),
      ...(parsed.expiryDate !== undefined && { expiryDate: parsed.expiryDate }),
      ...(parsed.quantity !== undefined && { quantity: parsed.quantity }),
      ...(parsed.costPrice !== undefined && { costPrice: BigInt(parsed.costPrice) }),
      ...(parsed.supplierId !== undefined && { supplierId: parsed.supplierId }),
    },
  });

  await writeAuditLog(tx, { organizationId }, {
    action: "batch.updated",
    entityType: "product_batch",
    entityId: id,
    after: parsed,
  });

  return batch;
}

export async function deleteBatch(
  tx: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  id: string,
) {
  const batch = await tx.productBatch.findFirst({
    where: { id, organizationId },
  });
  if (!batch) throw ApiError.notFound("Batch not found");

  const movementCount = await tx.stockMovement.count({
    where: { organizationId, productId: batch.productId },
  });
  if (movementCount > 0) {
    throw ApiError.badRequest(
      "Cannot delete batch with existing stock movements. Remove movements first.",
    );
  }

  await tx.productBatch.delete({ where: { id } });

  await writeAuditLog(tx, { organizationId }, {
    action: "batch.deleted",
    entityType: "product_batch",
    entityId: id,
    before: { batchNo: batch.batchNo, productId: batch.productId },
  });

  return { deleted: true };
}

export async function listExpiringBatches(
  organizationId: string,
  withinDays: number,
  limit?: number,
) {
  const now = new Date();
  const future = new Date(now.getTime() + withinDays * 24 * 60 * 60 * 1000);

  const batches = await prisma.productBatch.findMany({
    where: {
      organizationId,
      expiryDate: { not: null, gte: now, lte: future },
    },
    orderBy: { expiryDate: "asc" },
    take: limit ?? 50,
  });

  return batches;
}

export async function listExpiredBatches(organizationId: string, limit?: number) {
  const now = new Date();

  const batches = await prisma.productBatch.findMany({
    where: {
      organizationId,
      expiryDate: { not: null, lt: now },
    },
    orderBy: { expiryDate: "asc" },
    take: limit ?? 50,
  });

  return batches;
}

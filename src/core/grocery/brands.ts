import { z } from "zod";
import type { Prisma, PrismaClient } from "@/core/db/generated/prisma/client";
import { prisma } from "@/core/db/client";
import { ApiError } from "@/core/http/api";
import { writeAuditLog } from "@/core/audit/service";

export const createBrandSchema = z.object({
  name: z.string().min(1).max(200),
  nameAr: z.string().max(200).optional(),
  description: z.string().max(1000).optional(),
  logoUrl: z.string().url().max(500).optional(),
});

export const updateBrandSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  nameAr: z.string().max(200).optional(),
  description: z.string().max(1000).optional(),
  logoUrl: z.string().url().max(500).optional(),
  isActive: z.boolean().optional(),
});

export type CreateBrandInput = z.infer<typeof createBrandSchema>;
export type UpdateBrandInput = z.infer<typeof updateBrandSchema>;

export interface ListBrandsOpts {
  search?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

export async function listBrands(organizationId: string, opts?: ListBrandsOpts) {
  const page = opts?.page ?? 1;
  const pageSize = opts?.pageSize ?? 20;
  const skip = (page - 1) * pageSize;

  const where: Prisma.brandWhereInput = { organizationId };
  if (opts?.isActive !== undefined) where.isActive = opts.isActive;
  if (opts?.search) {
    where.OR = [
      { name: { contains: opts.search, mode: "insensitive" } },
      { nameAr: { contains: opts.search, mode: "insensitive" } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.brand.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { name: "asc" },
    }),
    prisma.brand.count({ where }),
  ]);

  return { rows, total, page, pageSize };
}

export async function getBrand(organizationId: string, id: string) {
  const brand = await prisma.brand.findFirst({
    where: { id, organizationId },
  });
  if (!brand) throw ApiError.notFound("Brand not found");
  return brand;
}

export async function createBrand(
  tx: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  data: CreateBrandInput,
) {
  const parsed = createBrandSchema.parse(data);

  const existing = await tx.brand.findFirst({
    where: { organizationId, name: parsed.name },
  });
  if (existing) throw ApiError.conflict("Brand name already exists");

  const brand = await tx.brand.create({
    data: {
      organizationId,
      name: parsed.name,
      nameAr: parsed.nameAr,
      description: parsed.description,
      logoUrl: parsed.logoUrl,
    },
  });

  await writeAuditLog(tx, { organizationId }, {
    action: "brand.created",
    entityType: "brand",
    entityId: brand.id,
    after: { name: brand.name },
  });

  return brand;
}

export async function updateBrand(
  tx: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  id: string,
  data: UpdateBrandInput,
) {
  const parsed = updateBrandSchema.parse(data);

  const existing = await tx.brand.findFirst({
    where: { id, organizationId },
  });
  if (!existing) throw ApiError.notFound("Brand not found");

  if (parsed.name && parsed.name !== existing.name) {
    const duplicate = await tx.brand.findFirst({
      where: { organizationId, name: parsed.name, id: { not: id } },
    });
    if (duplicate) throw ApiError.conflict("Brand name already exists");
  }

  const brand = await tx.brand.update({
    where: { id },
    data: {
      ...(parsed.name !== undefined && { name: parsed.name }),
      ...(parsed.nameAr !== undefined && { nameAr: parsed.nameAr }),
      ...(parsed.description !== undefined && { description: parsed.description }),
      ...(parsed.logoUrl !== undefined && { logoUrl: parsed.logoUrl }),
      ...(parsed.isActive !== undefined && { isActive: parsed.isActive }),
    },
  });

  await writeAuditLog(tx, { organizationId }, {
    action: "brand.updated",
    entityType: "brand",
    entityId: id,
    before: { name: existing.name, isActive: existing.isActive },
    after: parsed,
  });

  return brand;
}

export async function deleteBrand(
  tx: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  id: string,
) {
  const brand = await tx.brand.findFirst({
    where: { id, organizationId },
  });
  if (!brand) throw ApiError.notFound("Brand not found");

  const productCount = await tx.product.count({
    where: { organizationId, isActive: true },
  });
  if (productCount > 0) {
    throw ApiError.badRequest(
      "Cannot delete brand with active products. Reassign or deactivate products first.",
    );
  }

  await tx.brand.delete({ where: { id } });

  await writeAuditLog(tx, { organizationId }, {
    action: "brand.deleted",
    entityType: "brand",
    entityId: id,
    before: { name: brand.name },
  });

  return { deleted: true };
}

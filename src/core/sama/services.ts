import { z } from "zod";
import type { Prisma, PrismaClient } from "@/core/db/generated/prisma/client";
import { prisma } from "@/core/db/client";
import { ApiError } from "@/core/http/api";
import { writeAuditLog } from "@/core/audit/service";

// ── Schemas ───────────────────────────────────────────────────────────────────

export const createServiceSchema = z.object({
  name: z.string().min(1).max(200),
  nameEn: z.string().max(200).optional(),
  price: z.number().int().min(0),
  iconUrl: z.string().max(500).optional(),
});

export const updateServiceSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  nameEn: z.string().max(200).optional(),
  price: z.number().int().min(0).optional(),
  iconUrl: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
});

export type CreateServiceInput = z.infer<typeof createServiceSchema>;
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;

// ── Service CRUD ──────────────────────────────────────────────────────────────

export async function listServices(organizationId: string) {
  const services = await prisma.samaService.findMany({
    where: { organizationId, isActive: true },
    orderBy: { name: "asc" },
  });
  return services;
}

export async function getService(organizationId: string, id: string) {
  const service = await prisma.samaService.findFirst({
    where: { id, organizationId },
  });
  if (!service) throw ApiError.notFound("Service not found");
  return service;
}

export async function createService(
  tx: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  userId: string,
  data: CreateServiceInput,
) {
  const parsed = createServiceSchema.parse(data);

  const existing = await tx.samaService.findFirst({
    where: { organizationId, name: parsed.name },
  });
  if (existing) throw ApiError.conflict("Service name already exists");

  const service = await tx.samaService.create({
    data: {
      organizationId,
      name: parsed.name,
      nameEn: parsed.nameEn,
      price: BigInt(parsed.price),
      iconUrl: parsed.iconUrl,
    },
  });

  await writeAuditLog(tx, { organizationId }, {
    action: "sama_service.created",
    entityType: "sama_service",
    entityId: service.id,
    after: { name: service.name, price: service.price.toString() },
  });

  return service;
}

export async function updateService(
  tx: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  id: string,
  data: UpdateServiceInput,
) {
  const parsed = updateServiceSchema.parse(data);

  const existing = await tx.samaService.findFirst({
    where: { id, organizationId },
  });
  if (!existing) throw ApiError.notFound("Service not found");

  if (parsed.name && parsed.name !== existing.name) {
    const duplicate = await tx.samaService.findFirst({
      where: { organizationId, name: parsed.name, id: { not: id } },
    });
    if (duplicate) throw ApiError.conflict("Service name already exists");
  }

  const service = await tx.samaService.update({
    where: { id },
    data: {
      ...(parsed.name !== undefined && { name: parsed.name }),
      ...(parsed.nameEn !== undefined && { nameEn: parsed.nameEn }),
      ...(parsed.price !== undefined && { price: BigInt(parsed.price) }),
      ...(parsed.iconUrl !== undefined && { iconUrl: parsed.iconUrl }),
      ...(parsed.isActive !== undefined && { isActive: parsed.isActive }),
    },
  });

  await writeAuditLog(tx, { organizationId }, {
    action: "sama_service.updated",
    entityType: "sama_service",
    entityId: id,
    after: parsed,
  });

  return service;
}

export async function deleteService(
  tx: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  id: string,
) {
  const service = await tx.samaService.findFirst({
    where: { id, organizationId },
  });
  if (!service) throw ApiError.notFound("Service not found");

  await tx.samaService.update({
    where: { id },
    data: { isActive: false, deletedAt: new Date() },
  });

  await writeAuditLog(tx, { organizationId }, {
    action: "sama_service.deleted",
    entityType: "sama_service",
    entityId: id,
    before: { name: service.name },
  });

  return { deleted: true };
}

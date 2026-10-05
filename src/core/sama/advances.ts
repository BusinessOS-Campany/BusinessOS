import { z } from "zod";
import type { Prisma, PrismaClient } from "@/core/db/generated/prisma/client";
import { prisma } from "@/core/db/client";
import { ApiError } from "@/core/http/api";
import { writeAuditLog } from "@/core/audit/service";

// ── Schemas ───────────────────────────────────────────────────────────────────

export const createAdvanceSchema = z.object({
  employeeName: z.string().min(1).max(200),
  specialty: z.string().max(200).optional(),
  amount: z.number().int().min(0),
  date: z.string(),
  notes: z.string().max(1000).optional(),
});

export const updateAdvanceSchema = z.object({
  employeeName: z.string().min(1).max(200).optional(),
  specialty: z.string().max(200).optional(),
  amount: z.number().int().min(0).optional(),
  date: z.string().optional(),
  notes: z.string().max(1000).optional(),
});

export type CreateAdvanceInput = z.infer<typeof createAdvanceSchema>;
export type UpdateAdvanceInput = z.infer<typeof updateAdvanceSchema>;

// ── List Options ──────────────────────────────────────────────────────────────

export interface ListAdvancesOpts {
  search?: string;
  employeeName?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
}

// ── Advance CRUD ──────────────────────────────────────────────────────────────

export async function listAdvances(organizationId: string, opts?: ListAdvancesOpts) {
  const page = opts?.page ?? 1;
  const pageSize = opts?.pageSize ?? 20;
  const skip = (page - 1) * pageSize;

  const where: Prisma.samaAdvanceWhereInput = { organizationId };
  if (opts?.employeeName) {
    where.employeeName = { contains: opts.employeeName, mode: "insensitive" };
  }
  if (opts?.from || opts?.to) {
    where.date = {
      ...(opts.from && { gte: opts.from }),
      ...(opts.to && { lte: opts.to }),
    };
  }
  if (opts?.search) {
    where.OR = [
      { employeeName: { contains: opts.search, mode: "insensitive" } },
      { specialty: { contains: opts.search, mode: "insensitive" } },
      { notes: { contains: opts.search, mode: "insensitive" } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.samaAdvance.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { date: "desc" },
    }),
    prisma.samaAdvance.count({ where }),
  ]);

  return { rows, total, page, pageSize };
}

export async function getAdvance(organizationId: string, id: string) {
  const advance = await prisma.samaAdvance.findFirst({
    where: { id, organizationId },
  });
  if (!advance) throw ApiError.notFound("Advance not found");
  return advance;
}

export async function createAdvance(
  tx: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  userId: string,
  data: CreateAdvanceInput,
) {
  const parsed = createAdvanceSchema.parse(data);

  const advance = await tx.samaAdvance.create({
    data: {
      organizationId,
      employeeName: parsed.employeeName,
      specialty: parsed.specialty,
      amount: BigInt(parsed.amount),
      date: new Date(parsed.date),
      notes: parsed.notes,
    },
  });

  await writeAuditLog(tx, { organizationId }, {
    action: "sama_advance.created",
    entityType: "sama_advance",
    entityId: advance.id,
    after: { employeeName: parsed.employeeName, amount: advance.amount.toString() },
  });

  return advance;
}

export async function updateAdvance(
  tx: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  id: string,
  data: UpdateAdvanceInput,
) {
  const parsed = updateAdvanceSchema.parse(data);

  const existing = await tx.samaAdvance.findFirst({
    where: { id, organizationId },
  });
  if (!existing) throw ApiError.notFound("Advance not found");

  const advance = await tx.samaAdvance.update({
    where: { id },
    data: {
      ...(parsed.employeeName !== undefined && { employeeName: parsed.employeeName }),
      ...(parsed.specialty !== undefined && { specialty: parsed.specialty }),
      ...(parsed.amount !== undefined && { amount: BigInt(parsed.amount) }),
      ...(parsed.date !== undefined && { date: new Date(parsed.date) }),
      ...(parsed.notes !== undefined && { notes: parsed.notes }),
    },
  });

  await writeAuditLog(tx, { organizationId }, {
    action: "sama_advance.updated",
    entityType: "sama_advance",
    entityId: id,
    after: parsed,
  });

  return advance;
}

export async function deleteAdvance(
  tx: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  id: string,
) {
  const advance = await tx.samaAdvance.findFirst({
    where: { id, organizationId },
  });
  if (!advance) throw ApiError.notFound("Advance not found");

  await tx.samaAdvance.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  await writeAuditLog(tx, { organizationId }, {
    action: "sama_advance.deleted",
    entityType: "sama_advance",
    entityId: id,
    before: { employeeName: advance.employeeName, amount: advance.amount.toString() },
  });

  return { deleted: true };
}

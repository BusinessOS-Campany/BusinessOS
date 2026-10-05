import { z } from "zod";
import type { Prisma, PrismaClient } from "@/core/db/generated/prisma/client";
import { prisma } from "@/core/db/client";
import { ApiError } from "@/core/http/api";
import { writeAuditLog } from "@/core/audit/service";

// ── Schemas ───────────────────────────────────────────────────────────────────

export const createCoverageSchema = z.object({
  employeeName: z.string().min(1).max(200),
  sessionType: z.enum(["normal", "hijama"]).optional(),
  date: z.string(),
  price: z.number().int().min(0),
  therapistShare: z.number().int().min(0).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const updateCoverageSchema = z.object({
  employeeName: z.string().min(1).max(200).optional(),
  sessionType: z.enum(["normal", "hijama"]).optional(),
  date: z.string().optional(),
  price: z.number().int().min(0).optional(),
  therapistShare: z.number().int().min(0).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export type CreateCoverageInput = z.infer<typeof createCoverageSchema>;
export type UpdateCoverageInput = z.infer<typeof updateCoverageSchema>;

// ── List Options ──────────────────────────────────────────────────────────────

export interface ListCoveragesOpts {
  search?: string;
  employeeName?: string;
  sessionType?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
}

// ── Coverage CRUD ─────────────────────────────────────────────────────────────

export async function listCoverages(organizationId: string, opts?: ListCoveragesOpts) {
  const page = opts?.page ?? 1;
  const pageSize = opts?.pageSize ?? 20;
  const skip = (page - 1) * pageSize;

  const where: Prisma.samaCoverageWhereInput = { organizationId };
  if (opts?.employeeName) {
    where.employeeName = { contains: opts.employeeName, mode: "insensitive" };
  }
  if (opts?.sessionType) where.sessionType = opts.sessionType;
  if (opts?.from || opts?.to) {
    where.date = {
      ...(opts.from && { gte: opts.from }),
      ...(opts.to && { lte: opts.to }),
    };
  }
  if (opts?.search) {
    where.OR = [
      { employeeName: { contains: opts.search, mode: "insensitive" } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.samaCoverage.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { date: "desc" },
    }),
    prisma.samaCoverage.count({ where }),
  ]);

  return { rows, total, page, pageSize };
}

export async function getCoverage(organizationId: string, id: string) {
  const coverage = await prisma.samaCoverage.findFirst({
    where: { id, organizationId },
  });
  if (!coverage) throw ApiError.notFound("Coverage not found");
  return coverage;
}

export async function createCoverage(
  tx: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  userId: string,
  data: CreateCoverageInput,
) {
  const parsed = createCoverageSchema.parse(data);

  const coverage = await tx.samaCoverage.create({
    data: {
      organizationId,
      employeeName: parsed.employeeName,
      sessionType: parsed.sessionType ?? "normal",
      date: new Date(parsed.date),
      price: BigInt(parsed.price),
      therapistShare: parsed.therapistShare ? BigInt(parsed.therapistShare) : 50000n,
      from: parsed.from,
      to: parsed.to,
    },
  });

  await writeAuditLog(tx, { organizationId }, {
    action: "sama_coverage.created",
    entityType: "sama_coverage",
    entityId: coverage.id,
    after: { employeeName: parsed.employeeName, price: coverage.price.toString() },
  });

  return coverage;
}

export async function updateCoverage(
  tx: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  id: string,
  data: UpdateCoverageInput,
) {
  const parsed = updateCoverageSchema.parse(data);

  const existing = await tx.samaCoverage.findFirst({
    where: { id, organizationId },
  });
  if (!existing) throw ApiError.notFound("Coverage not found");

  const coverage = await tx.samaCoverage.update({
    where: { id },
    data: {
      ...(parsed.employeeName !== undefined && { employeeName: parsed.employeeName }),
      ...(parsed.sessionType !== undefined && { sessionType: parsed.sessionType }),
      ...(parsed.date !== undefined && { date: new Date(parsed.date) }),
      ...(parsed.price !== undefined && { price: BigInt(parsed.price) }),
      ...(parsed.therapistShare !== undefined && { therapistShare: BigInt(parsed.therapistShare) }),
      ...(parsed.from !== undefined && { from: parsed.from }),
      ...(parsed.to !== undefined && { to: parsed.to }),
    },
  });

  await writeAuditLog(tx, { organizationId }, {
    action: "sama_coverage.updated",
    entityType: "sama_coverage",
    entityId: id,
    after: parsed,
  });

  return coverage;
}

export async function deleteCoverage(
  tx: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  id: string,
) {
  const coverage = await tx.samaCoverage.findFirst({
    where: { id, organizationId },
  });
  if (!coverage) throw ApiError.notFound("Coverage not found");

  await tx.samaCoverage.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  await writeAuditLog(tx, { organizationId }, {
    action: "sama_coverage.deleted",
    entityType: "sama_coverage",
    entityId: id,
    before: { employeeName: coverage.employeeName, price: coverage.price.toString() },
  });

  return { deleted: true };
}

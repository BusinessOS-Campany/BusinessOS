import { z } from "zod";
import type { Prisma, PrismaClient } from "@/core/db/generated/prisma/client";
import { prisma } from "@/core/db/client";
import { ApiError } from "@/core/http/api";
import { writeAuditLog } from "@/core/audit/service";

// ── Schemas ───────────────────────────────────────────────────────────────────

export const createSessionSchema = z.object({
  patientName: z.string().min(1).max(200),
  sessionType: z.enum(["normal", "hijama"]).optional(),
  special: z.string().max(500).optional(),
  sessionDate: z.string().optional(),
  price: z.number().int().min(0).optional(),
  notes: z.string().max(1000).optional(),
  paymentMethod: z.string().optional(),
  walletType: z.string().optional(),
  transactionNumber: z.string().optional(),
  prepaid: z.boolean().optional(),
});

export const updateSessionSchema = z.object({
  patientName: z.string().min(1).max(200).optional(),
  sessionType: z.enum(["normal", "hijama"]).optional(),
  special: z.string().max(500).optional(),
  sessionDate: z.string().optional(),
  price: z.number().int().min(0).optional(),
  notes: z.string().max(1000).optional(),
  paymentMethod: z.string().optional(),
  walletType: z.string().optional(),
  transactionNumber: z.string().optional(),
  prepaid: z.boolean().optional(),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type UpdateSessionInput = z.infer<typeof updateSessionSchema>;

// ── List Options ──────────────────────────────────────────────────────────────

export interface ListSessionsOpts {
  search?: string;
  status?: string;
  sessionType?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
}

// ── Session CRUD ──────────────────────────────────────────────────────────────

export async function listSessions(organizationId: string, opts?: ListSessionsOpts) {
  const page = opts?.page ?? 1;
  const pageSize = opts?.pageSize ?? 20;
  const skip = (page - 1) * pageSize;

  const where: Prisma.samaSessionWhereInput = { organizationId };
  if (opts?.status) where.status = opts.status;
  if (opts?.sessionType) where.sessionType = opts.sessionType;
  if (opts?.from || opts?.to) {
    where.sessionDate = {
      ...(opts.from && { gte: opts.from }),
      ...(opts.to && { lte: opts.to }),
    };
  }
  if (opts?.search) {
    where.OR = [
      { patientName: { contains: opts.search, mode: "insensitive" } },
      { notes: { contains: opts.search, mode: "insensitive" } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.samaSession.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: "desc" },
    }),
    prisma.samaSession.count({ where }),
  ]);

  return { rows, total, page, pageSize };
}

export async function getSession(organizationId: string, id: string) {
  const session = await prisma.samaSession.findFirst({
    where: { id, organizationId },
  });
  if (!session) throw ApiError.notFound("Session not found");
  return session;
}

export async function createSession(
  tx: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  userId: string,
  data: CreateSessionInput,
) {
  const parsed = createSessionSchema.parse(data);

  const session = await tx.samaSession.create({
    data: {
      organizationId,
      patientName: parsed.patientName,
      sessionType: parsed.sessionType ?? "normal",
      special: parsed.special,
      sessionDate: parsed.sessionDate ? new Date(parsed.sessionDate) : new Date(),
      price: parsed.price ? BigInt(parsed.price) : null,
      notes: parsed.notes,
      paymentMethod: parsed.paymentMethod,
      walletType: parsed.walletType,
      transactionNumber: parsed.transactionNumber,
      prepaid: parsed.prepaid ?? false,
    },
  });

  await writeAuditLog(tx, { organizationId }, {
    action: "sama_session.created",
    entityType: "sama_session",
    entityId: session.id,
    after: { patientName: parsed.patientName, sessionType: session.sessionType },
  });

  return session;
}

export async function updateSession(
  tx: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  id: string,
  data: UpdateSessionInput,
) {
  const parsed = updateSessionSchema.parse(data);

  const existing = await tx.samaSession.findFirst({
    where: { id, organizationId },
  });
  if (!existing) throw ApiError.notFound("Session not found");

  const session = await tx.samaSession.update({
    where: { id },
    data: {
      ...(parsed.patientName !== undefined && { patientName: parsed.patientName }),
      ...(parsed.sessionType !== undefined && { sessionType: parsed.sessionType }),
      ...(parsed.special !== undefined && { special: parsed.special }),
      ...(parsed.sessionDate !== undefined && { sessionDate: new Date(parsed.sessionDate) }),
      ...(parsed.price !== undefined && { price: parsed.price ? BigInt(parsed.price) : null }),
      ...(parsed.notes !== undefined && { notes: parsed.notes }),
      ...(parsed.paymentMethod !== undefined && { paymentMethod: parsed.paymentMethod }),
      ...(parsed.walletType !== undefined && { walletType: parsed.walletType }),
      ...(parsed.transactionNumber !== undefined && { transactionNumber: parsed.transactionNumber }),
      ...(parsed.prepaid !== undefined && { prepaid: parsed.prepaid }),
    },
  });

  await writeAuditLog(tx, { organizationId }, {
    action: "sama_session.updated",
    entityType: "sama_session",
    entityId: id,
    after: parsed,
  });

  return session;
}

export async function updateSessionStatus(
  tx: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  id: string,
  status: string,
) {
  const existing = await tx.samaSession.findFirst({
    where: { id, organizationId },
  });
  if (!existing) throw ApiError.notFound("Session not found");

  const session = await tx.samaSession.update({
    where: { id },
    data: { status },
  });

  await writeAuditLog(tx, { organizationId }, {
    action: "sama_session.status_changed",
    entityType: "sama_session",
    entityId: id,
    before: { status: existing.status },
    after: { status },
  });

  return session;
}

export async function deleteSession(
  tx: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  id: string,
) {
  const session = await tx.samaSession.findFirst({
    where: { id, organizationId },
  });
  if (!session) throw ApiError.notFound("Session not found");

  await tx.samaSession.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  await writeAuditLog(tx, { organizationId }, {
    action: "sama_session.deleted",
    entityType: "sama_session",
    entityId: id,
    before: { patientName: session.patientName, status: session.status },
  });

  return { deleted: true };
}

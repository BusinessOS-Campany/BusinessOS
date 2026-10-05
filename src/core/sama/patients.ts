import { z } from "zod";
import type { Prisma, PrismaClient } from "@/core/db/generated/prisma/client";
import { prisma } from "@/core/db/client";
import { ApiError } from "@/core/http/api";
import { writeAuditLog } from "@/core/audit/service";

// ── Schemas ───────────────────────────────────────────────────────────────────

export const createPatientSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().max(100).optional(),
  phone: z.string().max(32).optional(),
  gender: z.enum(["male", "female"]).optional(),
  dateOfBirth: z.string().optional(),
  examType: z.enum(["physiotherapy", "nutrition"]).optional(),
  price: z.number().int().min(0).optional(),
  paymentMethod: z.string().optional(),
  notes: z.string().max(1000).optional(),
  special: z.string().max(500).optional(),
});

export const updatePatientSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().max(100).optional(),
  phone: z.string().max(32).optional(),
  gender: z.enum(["male", "female"]).optional(),
  dateOfBirth: z.string().optional(),
  examType: z.enum(["physiotherapy", "nutrition"]).optional(),
  price: z.number().int().min(0).optional(),
  paymentMethod: z.string().optional(),
  walletType: z.string().optional(),
  transactionNumber: z.string().optional(),
  notes: z.string().max(1000).optional(),
  special: z.string().max(500).optional(),
  status: z.enum(["progress", "completed", "cancelled"]).optional(),
  isActive: z.boolean().optional(),
});

export type CreatePatientInput = z.infer<typeof createPatientSchema>;
export type UpdatePatientInput = z.infer<typeof updatePatientSchema>;

// ── List Options ──────────────────────────────────────────────────────────────

export interface ListPatientsOpts {
  search?: string;
  status?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

// ── Patient CRUD ──────────────────────────────────────────────────────────────

export async function listPatients(organizationId: string, opts?: ListPatientsOpts) {
  const page = opts?.page ?? 1;
  const pageSize = opts?.pageSize ?? 20;
  const skip = (page - 1) * pageSize;

  const where: Prisma.samaPatientWhereInput = { organizationId };
  if (opts?.isActive !== undefined) where.isActive = opts.isActive;
  if (opts?.status) where.status = opts.status;
  if (opts?.search) {
    where.OR = [
      { firstName: { contains: opts.search, mode: "insensitive" } },
      { lastName: { contains: opts.search, mode: "insensitive" } },
      { phone: { contains: opts.search, mode: "insensitive" } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.samaPatient.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { serialNumber: "desc" },
    }),
    prisma.samaPatient.count({ where }),
  ]);

  return { rows, total, page, pageSize };
}

export async function getPatient(organizationId: string, id: string) {
  const patient = await prisma.samaPatient.findFirst({
    where: { id, organizationId },
  });
  if (!patient) throw ApiError.notFound("Patient not found");
  return patient;
}

export async function createPatient(
  tx: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  userId: string,
  data: CreatePatientInput,
) {
  const parsed = createPatientSchema.parse(data);

  const maxSerial = await tx.samaPatient.findFirst({
    where: { organizationId },
    orderBy: { serialNumber: "desc" },
    select: { serialNumber: true },
  });
  const serialNumber = (maxSerial?.serialNumber ?? 0) + 1;

  const patient = await tx.samaPatient.create({
    data: {
      organizationId,
      serialNumber,
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      phone: parsed.phone,
      gender: parsed.gender,
      dateOfBirth: parsed.dateOfBirth ? new Date(parsed.dateOfBirth) : null,
      examType: parsed.examType,
      price: parsed.price ? BigInt(parsed.price) : 0n,
      paymentMethod: parsed.paymentMethod,
      notes: parsed.notes,
      special: parsed.special,
      registrationDate: new Date(),
    },
  });

  await writeAuditLog(tx, { organizationId }, {
    action: "sama_patient.created",
    entityType: "sama_patient",
    entityId: patient.id,
    after: { firstName: patient.firstName, serialNumber },
  });

  return patient;
}

export async function updatePatient(
  tx: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  id: string,
  data: UpdatePatientInput,
) {
  const parsed = updatePatientSchema.parse(data);

  const existing = await tx.samaPatient.findFirst({
    where: { id, organizationId },
  });
  if (!existing) throw ApiError.notFound("Patient not found");

  const patient = await tx.samaPatient.update({
    where: { id },
    data: {
      ...(parsed.firstName !== undefined && { firstName: parsed.firstName }),
      ...(parsed.lastName !== undefined && { lastName: parsed.lastName }),
      ...(parsed.phone !== undefined && { phone: parsed.phone }),
      ...(parsed.gender !== undefined && { gender: parsed.gender }),
      ...(parsed.dateOfBirth !== undefined && {
        dateOfBirth: parsed.dateOfBirth ? new Date(parsed.dateOfBirth) : null,
      }),
      ...(parsed.examType !== undefined && { examType: parsed.examType }),
      ...(parsed.price !== undefined && { price: BigInt(parsed.price) }),
      ...(parsed.paymentMethod !== undefined && { paymentMethod: parsed.paymentMethod }),
      ...(parsed.walletType !== undefined && { walletType: parsed.walletType }),
      ...(parsed.transactionNumber !== undefined && { transactionNumber: parsed.transactionNumber }),
      ...(parsed.notes !== undefined && { notes: parsed.notes }),
      ...(parsed.special !== undefined && { special: parsed.special }),
      ...(parsed.status !== undefined && { status: parsed.status }),
      ...(parsed.isActive !== undefined && { isActive: parsed.isActive }),
    },
  });

  await writeAuditLog(tx, { organizationId }, {
    action: "sama_patient.updated",
    entityType: "sama_patient",
    entityId: id,
    after: parsed,
  });

  return patient;
}

export async function deletePatient(
  tx: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  id: string,
) {
  const patient = await tx.samaPatient.findFirst({
    where: { id, organizationId },
  });
  if (!patient) throw ApiError.notFound("Patient not found");

  await tx.samaPatient.update({
    where: { id },
    data: { isActive: false, deletedAt: new Date() },
  });

  await writeAuditLog(tx, { organizationId }, {
    action: "sama_patient.deleted",
    entityType: "sama_patient",
    entityId: id,
    before: { firstName: patient.firstName, serialNumber: patient.serialNumber },
  });

  return { deleted: true };
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export async function getPatientStats(organizationId: string) {
  const [total, active, male, female, progress, completed, cancelled] = await Promise.all([
    prisma.samaPatient.count({ where: { organizationId } }),
    prisma.samaPatient.count({ where: { organizationId, isActive: true } }),
    prisma.samaPatient.count({ where: { organizationId, gender: "male" } }),
    prisma.samaPatient.count({ where: { organizationId, gender: "female" } }),
    prisma.samaPatient.count({ where: { organizationId, status: "progress" } }),
    prisma.samaPatient.count({ where: { organizationId, status: "completed" } }),
    prisma.samaPatient.count({ where: { organizationId, status: "cancelled" } }),
  ]);

  return {
    total,
    active,
    male,
    female,
    byStatus: { progress, completed, cancelled },
  };
}

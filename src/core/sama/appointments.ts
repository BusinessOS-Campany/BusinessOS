import { z } from "zod";
import type { Prisma, PrismaClient } from "@/core/db/generated/prisma/client";
import { prisma } from "@/core/db/client";
import { ApiError } from "@/core/http/api";
import { writeAuditLog } from "@/core/audit/service";

// ── Schemas ───────────────────────────────────────────────────────────────────

export const createAppointmentSchema = z.object({
  patientName: z.string().min(1).max(200),
  phone: z.string().max(32).optional(),
  therapist: z.string().max(200).optional(),
  date: z.string().optional(),
  notes: z.string().max(1000).optional(),
});

export const updateAppointmentSchema = z.object({
  patientName: z.string().min(1).max(200).optional(),
  phone: z.string().max(32).optional(),
  therapist: z.string().max(200).optional(),
  date: z.string().optional(),
  notes: z.string().max(1000).optional(),
  status: z.enum(["pending", "confirmed", "completed", "cancelled", "no-show"]).optional(),
});

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;

// ── List Options ──────────────────────────────────────────────────────────────

export interface ListAppointmentsOpts {
  search?: string;
  status?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
}

// ── Appointment CRUD ──────────────────────────────────────────────────────────

export async function listAppointments(organizationId: string, opts?: ListAppointmentsOpts) {
  const page = opts?.page ?? 1;
  const pageSize = opts?.pageSize ?? 20;
  const skip = (page - 1) * pageSize;

  const where: Prisma.samaAppointmentWhereInput = { organizationId };
  if (opts?.status) where.status = opts.status;
  if (opts?.from || opts?.to) {
    where.date = {
      ...(opts.from && { gte: opts.from }),
      ...(opts.to && { lte: opts.to }),
    };
  }
  if (opts?.search) {
    where.OR = [
      { patientName: { contains: opts.search, mode: "insensitive" } },
      { phone: { contains: opts.search, mode: "insensitive" } },
      { therapist: { contains: opts.search, mode: "insensitive" } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.samaAppointment.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { date: "asc" },
    }),
    prisma.samaAppointment.count({ where }),
  ]);

  return { rows, total, page, pageSize };
}

export async function getAppointment(organizationId: string, id: string) {
  const appointment = await prisma.samaAppointment.findFirst({
    where: { id, organizationId },
  });
  if (!appointment) throw ApiError.notFound("Appointment not found");
  return appointment;
}

export async function createAppointment(
  tx: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  userId: string,
  data: CreateAppointmentInput,
) {
  const parsed = createAppointmentSchema.parse(data);

  const appointment = await tx.samaAppointment.create({
    data: {
      organizationId,
      patientName: parsed.patientName,
      phone: parsed.phone,
      therapist: parsed.therapist,
      date: parsed.date ? new Date(parsed.date) : null,
      notes: parsed.notes,
    },
  });

  await writeAuditLog(tx, { organizationId }, {
    action: "sama_appointment.created",
    entityType: "sama_appointment",
    entityId: appointment.id,
    after: { patientName: parsed.patientName, therapist: parsed.therapist },
  });

  return appointment;
}

export async function updateAppointment(
  tx: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  id: string,
  data: UpdateAppointmentInput,
) {
  const parsed = updateAppointmentSchema.parse(data);

  const existing = await tx.samaAppointment.findFirst({
    where: { id, organizationId },
  });
  if (!existing) throw ApiError.notFound("Appointment not found");

  const appointment = await tx.samaAppointment.update({
    where: { id },
    data: {
      ...(parsed.patientName !== undefined && { patientName: parsed.patientName }),
      ...(parsed.phone !== undefined && { phone: parsed.phone }),
      ...(parsed.therapist !== undefined && { therapist: parsed.therapist }),
      ...(parsed.date !== undefined && { date: parsed.date ? new Date(parsed.date) : null }),
      ...(parsed.notes !== undefined && { notes: parsed.notes }),
      ...(parsed.status !== undefined && { status: parsed.status }),
    },
  });

  await writeAuditLog(tx, { organizationId }, {
    action: "sama_appointment.updated",
    entityType: "sama_appointment",
    entityId: id,
    after: parsed,
  });

  return appointment;
}

export async function updateAppointmentStatus(
  tx: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  id: string,
  status: string,
) {
  const existing = await tx.samaAppointment.findFirst({
    where: { id, organizationId },
  });
  if (!existing) throw ApiError.notFound("Appointment not found");

  const appointment = await tx.samaAppointment.update({
    where: { id },
    data: { status },
  });

  await writeAuditLog(tx, { organizationId }, {
    action: "sama_appointment.status_changed",
    entityType: "sama_appointment",
    entityId: id,
    before: { status: existing.status },
    after: { status },
  });

  return appointment;
}

export async function deleteAppointment(
  tx: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  id: string,
) {
  const appointment = await tx.samaAppointment.findFirst({
    where: { id, organizationId },
  });
  if (!appointment) throw ApiError.notFound("Appointment not found");

  await tx.samaAppointment.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  await writeAuditLog(tx, { organizationId }, {
    action: "sama_appointment.deleted",
    entityType: "sama_appointment",
    entityId: id,
    before: { patientName: appointment.patientName, status: appointment.status },
  });

  return { deleted: true };
}

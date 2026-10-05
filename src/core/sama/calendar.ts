import { z } from "zod";
import type { Prisma, PrismaClient } from "@/core/db/generated/prisma/client";
import { prisma } from "@/core/db/client";
import { ApiError } from "@/core/http/api";
import { writeAuditLog } from "@/core/audit/service";

// ── Schemas ───────────────────────────────────────────────────────────────────

export const createEventSchema = z.object({
  eventName: z.string().min(1).max(200),
  date: z.string(),
  endDate: z.string().optional(),
  type: z.string().min(1).max(100),
  startTime: z.string().max(16).optional(),
  endTime: z.string().max(16).optional(),
  location: z.string().max(500).optional(),
  description: z.string().max(2000).optional(),
});

export const updateEventSchema = z.object({
  eventName: z.string().min(1).max(200).optional(),
  date: z.string().optional(),
  endDate: z.string().optional(),
  type: z.string().min(1).max(100).optional(),
  startTime: z.string().max(16).optional(),
  endTime: z.string().max(16).optional(),
  location: z.string().max(500).optional(),
  description: z.string().max(2000).optional(),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

// ── List Options ──────────────────────────────────────────────────────────────

export interface ListEventsOpts {
  type?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
}

// ── Event CRUD ────────────────────────────────────────────────────────────────

export async function listEvents(organizationId: string, opts?: ListEventsOpts) {
  const page = opts?.page ?? 1;
  const pageSize = opts?.pageSize ?? 50;
  const skip = (page - 1) * pageSize;

  const where: Prisma.samaCalendarEventWhereInput = { organizationId };
  if (opts?.type) where.type = opts.type;
  if (opts?.from || opts?.to) {
    where.date = {
      ...(opts.from && { gte: opts.from }),
      ...(opts.to && { lte: opts.to }),
    };
  }

  const [rows, total] = await Promise.all([
    prisma.samaCalendarEvent.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { date: "asc" },
    }),
    prisma.samaCalendarEvent.count({ where }),
  ]);

  return { rows, total, page, pageSize };
}

export async function getEvent(organizationId: string, id: string) {
  const event = await prisma.samaCalendarEvent.findFirst({
    where: { id, organizationId },
  });
  if (!event) throw ApiError.notFound("Event not found");
  return event;
}

export async function createEvent(
  tx: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  userId: string,
  data: CreateEventInput,
) {
  const parsed = createEventSchema.parse(data);

  const event = await tx.samaCalendarEvent.create({
    data: {
      organizationId,
      eventName: parsed.eventName,
      date: new Date(parsed.date),
      endDate: parsed.endDate ? new Date(parsed.endDate) : null,
      type: parsed.type,
      startTime: parsed.startTime,
      endTime: parsed.endTime,
      location: parsed.location,
      description: parsed.description,
    },
  });

  await writeAuditLog(tx, { organizationId }, {
    action: "sama_calendar_event.created",
    entityType: "sama_calendar_event",
    entityId: event.id,
    after: { eventName: parsed.eventName, type: parsed.type },
  });

  return event;
}

export async function updateEvent(
  tx: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  id: string,
  data: UpdateEventInput,
) {
  const parsed = updateEventSchema.parse(data);

  const existing = await tx.samaCalendarEvent.findFirst({
    where: { id, organizationId },
  });
  if (!existing) throw ApiError.notFound("Event not found");

  const event = await tx.samaCalendarEvent.update({
    where: { id },
    data: {
      ...(parsed.eventName !== undefined && { eventName: parsed.eventName }),
      ...(parsed.date !== undefined && { date: new Date(parsed.date) }),
      ...(parsed.endDate !== undefined && { endDate: parsed.endDate ? new Date(parsed.endDate) : null }),
      ...(parsed.type !== undefined && { type: parsed.type }),
      ...(parsed.startTime !== undefined && { startTime: parsed.startTime }),
      ...(parsed.endTime !== undefined && { endTime: parsed.endTime }),
      ...(parsed.location !== undefined && { location: parsed.location }),
      ...(parsed.description !== undefined && { description: parsed.description }),
    },
  });

  await writeAuditLog(tx, { organizationId }, {
    action: "sama_calendar_event.updated",
    entityType: "sama_calendar_event",
    entityId: id,
    after: parsed,
  });

  return event;
}

export async function deleteEvent(
  tx: PrismaClient | Prisma.TransactionClient,
  organizationId: string,
  id: string,
) {
  const event = await tx.samaCalendarEvent.findFirst({
    where: { id, organizationId },
  });
  if (!event) throw ApiError.notFound("Event not found");

  await tx.samaCalendarEvent.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  await writeAuditLog(tx, { organizationId }, {
    action: "sama_calendar_event.deleted",
    entityType: "sama_calendar_event",
    entityId: id,
    before: { eventName: event.eventName, type: event.type },
  });

  return { deleted: true };
}

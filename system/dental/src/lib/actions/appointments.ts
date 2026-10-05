"use server"

import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requirePermission } from "@/lib/dal"
import { logAudit } from "@/lib/audit"

const appointmentSchema = z.object({
  patientId: z.string().min(1),
  dentistId: z.string().optional(),
  chairId: z.string().optional(),
  date: z.string().min(1),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  type: z.string().min(1),
  notes: z.string().optional(),
})

export type AppointmentFormState = {
  ok?: boolean
  date?: string
  error?: "invalid" | "conflict" | "permission" | "not_found" | "server"
  fieldErrors?: Record<string, string[]>
}

export async function createAppointmentAction(
  _prev: AppointmentFormState,
  formData: FormData
): Promise<AppointmentFormState> {
  const user = await requirePermission("appointments:create")
  const branchId = user.branchId ?? (await prisma.branch.findFirstOrThrow({ select: { id: true } })).id

  const str = (k: string) => {
    const v = formData.get(k)
    return typeof v === "string" ? v : ""
  }

  const parsed = appointmentSchema.safeParse({
    patientId: str("patientId"),
    dentistId: str("dentistId") || undefined,
    chairId: str("chairId") || undefined,
    date: str("date"),
    startTime: str("startTime"),
    endTime: str("endTime"),
    type: str("type"),
    notes: str("notes") || undefined,
  })

  if (!parsed.success) {
    return { error: "invalid", fieldErrors: parsed.error.flatten().fieldErrors }
  }

  const { date, startTime, endTime } = parsed.data
  const dateObj = new Date(`${date}T00:00:00Z`)
  if (endTime <= startTime) {
    return { error: "invalid", fieldErrors: { endTime: ["END_BEFORE_START"] } }
  }

  // Chair/dentist overlap check
  if (parsed.data.chairId) {
    const overlap = await prisma.appointment.findFirst({
      where: {
        chairId: parsed.data.chairId,
        date: dateObj,
        status: { notIn: ["CANCELLED", "NO_SHOW", "COMPLETED"] },
        OR: [{ startTime: { lt: endTime }, endTime: { gt: startTime } }],
      },
      select: { id: true },
    })
    if (overlap) return { error: "conflict" }
  }

  let created
  try {
    created = await prisma.appointment.create({
      data: {
        patientId: parsed.data.patientId,
        dentistId: parsed.data.dentistId ?? null,
        chairId: parsed.data.chairId ?? null,
        branchId,
        date: dateObj,
        startTime,
        endTime,
        type: parsed.data.type as never,
        notes: parsed.data.notes ?? null,
      },
      select: { id: true },
    })
  } catch {
    return { error: "server" }
  }

  await logAudit({
    userId: user.id,
    action: "CREATE",
    module: "Appointments",
    recordId: created.id,
    newValue: { date, startTime, endTime },
  })

  return { ok: true, date: parsed.data.date }
}

export async function updateAppointmentStatusAction(
  appointmentId: string,
  status: string
): Promise<{ ok: boolean; error?: "permission" | "not_found" | "server" }> {
  const user = await requirePermission("appointments:edit")

  const valid = ["SCHEDULED", "CONFIRMED", "CHECKED_IN", "IN_TREATMENT", "COMPLETED", "CANCELLED", "NO_SHOW", "RESCHEDULED"]
  if (!valid.includes(status)) return { ok: false, error: "not_found" }

  const existing = await prisma.appointment.findUnique({ where: { id: appointmentId }, select: { id: true } })
  if (!existing) return { ok: false, error: "not_found" }

  try {
    await prisma.$transaction([
      prisma.appointment.update({ where: { id: appointmentId }, data: { status: status as never } }),
    ])
    await logAudit({
      userId: user.id,
      action: "UPDATE",
      module: "Appointments",
      recordId: appointmentId,
      newValue: { status },
    })
    return { ok: true }
  } catch {
    return { ok: false, error: "server" }
  }
}
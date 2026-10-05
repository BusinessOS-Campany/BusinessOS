"use server"

import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requirePermission } from "@/lib/dal"
import { logAudit } from "@/lib/audit"

const WAITING_STATUSES = ["WAITING", "CALLED", "IN_ROOM", "WITH_DENTIST", "COMPLETED"]
const CHAIR_ACTIVE_STATUSES = ["WAITING", "CALLED", "IN_ROOM", "WITH_DENTIST"]

const checkInSchema = z.object({
  patientId: z.string().min(1),
  appointmentId: z.string().optional(),
  dentistId: z.string().optional(),
  chairId: z.string().optional(),
  priority: z.string().optional(),
  notes: z.string().optional(),
})

export type CheckInState = {
  ok?: boolean
  error?: "invalid" | "duplicate" | "permission" | "not_found" | "server"
  fieldErrors?: Record<string, string[]>
}

export async function checkInWaitingAction(
  _prev: CheckInState,
  formData: FormData
): Promise<CheckInState> {
  const user = await requirePermission("waitingRoom:create")
  const branchId = user.branchId ?? (await prisma.branch.findFirstOrThrow({ select: { id: true } })).id

  const str = (k: string) => {
    const v = formData.get(k)
    return typeof v === "string" ? v : ""
  }

  const parsed = checkInSchema.safeParse({
    patientId: str("patientId"),
    appointmentId: str("appointmentId") || undefined,
    dentistId: str("dentistId") || undefined,
    chairId: str("chairId") || undefined,
    priority: str("priority") || undefined,
    notes: str("notes") || undefined,
  })

  if (!parsed.success) {
    return { error: "invalid", fieldErrors: parsed.error.flatten().fieldErrors }
  }
  if (parsed.data.priority && !["MILD", "MODERATE", "SEVERE", "CRITICAL"].includes(parsed.data.priority)) {
    return { error: "invalid", fieldErrors: { priority: ["INVALID"] } }
  }

  const patient = await prisma.patient.findFirst({
    where: { id: parsed.data.patientId, deletedAt: null },
    select: { id: true },
  })
  if (!patient) return { error: "not_found" }

  const duplicate = await prisma.waitingEntry.findFirst({
    where: {
      branchId,
      patientId: parsed.data.patientId,
      status: { in: CHAIR_ACTIVE_STATUSES as never[] },
    },
    select: { id: true },
  })
  if (duplicate) return { error: "duplicate" }

  let appointmentId: string | null = null
  if (parsed.data.appointmentId) {
    const appt = await prisma.appointment.findFirst({
      where: {
        id: parsed.data.appointmentId,
        patientId: parsed.data.patientId,
        branchId,
        status: { in: ["SCHEDULED", "CONFIRMED"] },
      },
      select: { id: true },
    })
    if (!appt) return { error: "not_found" }
    appointmentId = appt.id
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.waitingEntry.create({
        data: {
          patientId: parsed.data.patientId,
          appointmentId,
          dentistId: parsed.data.dentistId ?? null,
          chairId: parsed.data.chairId ?? null,
          placedById: user.id,
          branchId,
          priority: parsed.data.priority ? (parsed.data.priority as never) : undefined,
          notes: parsed.data.notes ?? null,
        },
      })
      if (appointmentId) {
        await tx.appointment.update({
          where: { id: appointmentId },
          data: { status: "CHECKED_IN" },
        })
      }
      if (parsed.data.chairId) {
        await tx.chair.update({
          where: { id: parsed.data.chairId },
          data: { status: "RESERVED" },
        })
      }
    })
  } catch {
    return { error: "server" }
  }

  await logAudit({
    userId: user.id,
    action: "CREATE",
    module: "WaitingRoom",
    recordId: patient.id,
    newValue: { patientId: parsed.data.patientId, appointmentId, branchId },
  })

  return { ok: true }
}

export async function updateWaitingStatusAction(
  entryId: string,
  status: string
): Promise<{ ok: boolean; error?: "invalid" | "permission" | "not_found" | "server" }> {
  const user = await requirePermission("waitingRoom:edit")
  if (!WAITING_STATUSES.includes(status)) return { ok: false, error: "invalid" }

  const entry = await prisma.waitingEntry.findUnique({
    where: { id: entryId },
    select: { id: true, chairId: true, status: true },
  })
  if (!entry) return { ok: false, error: "not_found" }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.waitingEntry.update({
        where: { id: entryId },
        data: { status: status as never },
      })

      if (entry.chairId) {
        if (status === "IN_ROOM" || status === "WITH_DENTIST") {
          await tx.chair.update({
            where: { id: entry.chairId },
            data: { status: "IN_USE" },
          })
        }
        if (status === "COMPLETED") {
          const active = await tx.waitingEntry.count({
            where: { chairId: entry.chairId, status: { in: CHAIR_ACTIVE_STATUSES as never[] } },
          })
          if (active === 0) {
            await tx.chair.update({
              where: { id: entry.chairId },
              data: { status: "AVAILABLE" },
            })
          }
        }
      }
    })
  } catch {
    return { ok: false, error: "server" }
  }

  await logAudit({
    userId: user.id,
    action: "UPDATE",
    module: "WaitingRoom",
    recordId: entry.id,
    newValue: { status, chairId: entry.chairId },
  })

  return { ok: true }
}
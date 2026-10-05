"use server"

import { z } from "zod"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { requirePermission } from "@/lib/dal"
import { logAudit } from "@/lib/audit"
import { LAB_CASE_STATUSES } from "@/lib/constants/inventory"

const labCaseSchema = z.object({
  patientId: z.string().min(1),
  dentistId: z.string().optional(),
  toothNumbers: z.array(z.number().int().gte(1).lte(48)).max(32),
  restorationType: z.string().trim().max(120).optional(),
  labName: z.string().trim().max(160).optional(),
  expectedReturn: z.string().optional(),
  cost: z.number().gte(0),
  status: z.enum(LAB_CASE_STATUSES),
  notes: z.string().trim().max(2000).optional(),
})

export type LabCaseFormState = {
  ok?: boolean
  error?: "invalid" | "permission" | "not_found" | "server"
}

function str(v: unknown): string {
  return typeof v === "string" ? v : ""
}

function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function teeth(v: unknown): number[] {
  if (typeof v !== "string") return []
  return v
    .split(/[,\s،]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => Number(t))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 48)
}

function parse(formData: FormData) {
  return labCaseSchema.safeParse({
    patientId: str(formData.get("patientId")),
    dentistId: str(formData.get("dentistId")) || undefined,
    toothNumbers: teeth(formData.get("toothNumbers")),
    restorationType: str(formData.get("restorationType")) || undefined,
    labName: str(formData.get("labName")) || undefined,
    expectedReturn: str(formData.get("expectedReturn")) || undefined,
    cost: num(formData.get("cost")),
    status: str(formData.get("status")) || "CREATED",
    notes: str(formData.get("notes")) || undefined,
  })
}

function statusDates(status: string, existingSentAt: Date | null, existingActualReturn: Date | null) {
  const now = new Date()
  const sentAt =
    status === "SENT" || status === "IN_PRODUCTION" || status === "READY" || status === "RECEIVED" || status === "DELIVERED"
      ? existingSentAt ?? now
      : existingSentAt
  const actualReturn =
    status === "RECEIVED" || status === "DELIVERED" ? existingActualReturn ?? now : existingActualReturn
  return { sentAt, actualReturn }
}

export async function createLabCaseAction(
  _prev: LabCaseFormState,
  formData: FormData
): Promise<LabCaseFormState> {
  const user = await requirePermission("laboratory:create")
  const parsed = parse(formData)
  if (!parsed.success) return { error: "invalid" }

  const patient = await prisma.patient.findUnique({
    where: { id: parsed.data.patientId },
    select: { id: true },
  })
  if (!patient) return { error: "invalid" }

  const { sentAt, actualReturn } = statusDates(parsed.data.status, null, null)

  try {
    await prisma.labCase.create({
      data: {
        patientId: parsed.data.patientId,
        dentistId: parsed.data.dentistId ?? null,
        branchId: user.branchId ?? "",
        toothNumbers: parsed.data.toothNumbers,
        restorationType: parsed.data.restorationType ?? null,
        labName: parsed.data.labName ?? null,
        sentAt,
        expectedReturn: parsed.data.expectedReturn ? new Date(parsed.data.expectedReturn) : null,
        actualReturn,
        cost: new Prisma.Decimal(parsed.data.cost),
        status: parsed.data.status as never,
        notes: parsed.data.notes ?? null,
      },
    })
  } catch {
    return { error: "server" }
  }

  await logAudit({
    userId: user.id,
    action: "CREATE",
    module: "Laboratory",
    newValue: { status: parsed.data.status, cost: String(parsed.data.cost) },
  })

  return { ok: true }
}

export async function updateLabCaseAction(
  _prev: LabCaseFormState,
  formData: FormData
): Promise<LabCaseFormState> {
  const user = await requirePermission("laboratory:edit")
  const parsed = parse(formData)
  if (!parsed.success) return { error: "invalid" }

  const id = str(formData.get("id"))
  if (!id) return { error: "invalid" }

  const existing = await prisma.labCase.findUnique({
    where: { id },
    select: { id: true, sentAt: true, actualReturn: true },
  })
  if (!existing) return { error: "not_found" }

  const { sentAt, actualReturn } = statusDates(parsed.data.status, existing.sentAt, existing.actualReturn)

  try {
    await prisma.labCase.update({
      where: { id },
      data: {
        patientId: parsed.data.patientId,
        dentistId: parsed.data.dentistId ?? null,
        toothNumbers: parsed.data.toothNumbers,
        restorationType: parsed.data.restorationType ?? null,
        labName: parsed.data.labName ?? null,
        sentAt,
        expectedReturn: parsed.data.expectedReturn ? new Date(parsed.data.expectedReturn) : null,
        actualReturn,
        cost: new Prisma.Decimal(parsed.data.cost),
        status: parsed.data.status as never,
        notes: parsed.data.notes ?? null,
      },
    })
  } catch {
    return { error: "server" }
  }

  await logAudit({
    userId: user.id,
    action: "UPDATE",
    module: "Laboratory",
    recordId: id,
    newValue: { status: parsed.data.status, cost: String(parsed.data.cost) },
  })

  return { ok: true }
}
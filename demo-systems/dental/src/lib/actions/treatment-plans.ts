"use server"

import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requirePermission } from "@/lib/dal"
import { logAudit } from "@/lib/audit"
import { Prisma } from "@/generated/prisma/client"

const PLAN_STATUSES = [
  "DRAFT",
  "PROPOSED",
  "ACCEPTED",
  "IN_PROGRESS",
  "PARTIALLY_COMPLETED",
  "COMPLETED",
  "REJECTED",
  "CANCELLED",
] as const

const PROC_STATUSES = ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const

const SEVERITIES = ["MILD", "MODERATE", "SEVERE", "CRITICAL"] as const

const planSchema = z.object({
  patientId: z.string().min(1),
  dentistId: z.string().optional(),
  nameEn: z.string().trim().min(1),
  nameAr: z.string().trim().min(1),
  description: z.string().trim().max(2000).optional(),
  priority: z.enum(SEVERITIES).optional(),
  discount: z.string().optional(),
  procedures: z
    .array(
      z.object({
        procedureId: z.string().min(1),
        quantity: z.number().int().min(1).max(999),
        toothNumber: z.number().int().min(1).max(48).optional(),
        lineDiscount: z.string().optional(),
      })
    )
    .min(1),
})

export type TreatmentPlanFormState = {
  ok?: boolean
  error?: "invalid" | "permission" | "not_found" | "server"
  fieldErrors?: Record<string, string[]>
}

export async function createTreatmentPlanAction(
  _prev: TreatmentPlanFormState,
  formData: FormData
): Promise<TreatmentPlanFormState> {
  const user = await requirePermission("treatmentPlans:create")

  const str = (k: string) => {
    const v = formData.get(k)
    return typeof v === "string" ? v : ""
  }

  const procedureIds = formData.getAll("procedureId") as string[]
  const qty = formData.getAll("quantity") as string[]
  const tooth = formData.getAll("toothNumber") as string[]
  const lineDiscount = formData.getAll("lineDiscount") as string[]

  const parsed = planSchema.safeParse({
    patientId: str("patientId"),
    dentistId: str("dentistId") || undefined,
    nameEn: str("nameEn"),
    nameAr: str("nameAr"),
    description: str("description") || undefined,
    priority: str("priority") || undefined,
    discount: str("discount") || undefined,
    procedures: procedureIds.map((pid, i) => ({
      procedureId: pid,
      quantity: Number(qty[i] || 1),
      toothNumber: tooth[i] ? Number(tooth[i]) : undefined,
      lineDiscount: lineDiscount[i] || undefined,
    })),
  })

  if (!parsed.success) {
    return { error: "invalid", fieldErrors: parsed.error.flatten().fieldErrors }
  }

  const patient = await prisma.patient.findFirst({
    where: { id: parsed.data.patientId, deletedAt: null },
    select: { id: true },
  })
  if (!patient) return { error: "not_found" }

  const procIds = parsed.data.procedures.map((p) => p.procedureId)
  const catalog = await prisma.procedure.findMany({
    where: { id: { in: procIds }, isActive: true },
    select: { id: true, price: true },
  })
  const priceMap = new Map(catalog.map((p) => [p.id, new Prisma.Decimal(p.price)]))

  try {
    await prisma.$transaction(async (tx) => {
      let estimated = new Prisma.Decimal(0)
      const lines = parsed.data.procedures.map((p) => {
        const unitPrice = priceMap.get(p.procedureId) ?? new Prisma.Decimal(0)
        const qtyD = new Prisma.Decimal(p.quantity)
        const lineDc = p.lineDiscount ? new Prisma.Decimal(p.lineDiscount) : new Prisma.Decimal(0)
        const lineTotal = unitPrice.mul(qtyD).sub(lineDc)
        estimated = estimated.add(lineTotal)
        return { ...p, unitPrice, lineDc, lineTotal }
      })

      const planDc = new Prisma.Decimal(parsed.data.discount ?? 0)
      const final = Prisma.Decimal.max(0, estimated.sub(planDc))

      const plan = await tx.treatmentPlan.create({
        data: {
          patientId: parsed.data.patientId,
          dentistId: parsed.data.dentistId ?? null,
          branchId: user.branchId,
          nameEn: parsed.data.nameEn,
          nameAr: parsed.data.nameAr,
          description: parsed.data.description ?? null,
          status: "DRAFT" as never,
          priority: (parsed.data.priority as never) ?? undefined,
          estimatedCost: estimated.toNumber(),
          discount: planDc.toNumber(),
          finalCost: final.toNumber(),
        },
        select: { id: true },
      })

      for (const line of lines) {
        await tx.treatmentPlanProcedure.create({
          data: {
            planId: plan.id,
            procedureId: line.procedureId,
            toothNumber: line.toothNumber ?? null,
            quantity: line.quantity,
            unitPrice: line.unitPrice.toNumber(),
            discount: line.lineDc.toNumber(),
            total: line.lineTotal.toNumber(),
          },
        })
      }
    })
  } catch {
    return { error: "server" }
  }

  await logAudit({
    userId: user.id,
    action: "CREATE",
    module: "TreatmentPlans",
    recordId: patient.id,
    newValue: { nameEn: parsed.data.nameEn, procedures: parsed.data.procedures.length },
  })

  return { ok: true }
}

export async function updateTreatmentPlanStatusAction(
  id: string,
  status: string
): Promise<{ ok?: boolean; error?: string }> {
  const user = await requirePermission("treatmentPlans:edit")
  if (!PLAN_STATUSES.includes(status as (typeof PLAN_STATUSES)[number])) return { error: "invalid" }
  const plan = await prisma.treatmentPlan.findUnique({ where: { id }, select: { id: true, patientId: true } })
  if (!plan) return { error: "not_found" }
  await prisma.treatmentPlan.update({ where: { id }, data: { status: status as never } })
  await logAudit({
    userId: user.id,
    action: "STATUS",
    module: "TreatmentPlans",
    recordId: plan.patientId,
    newValue: { planId: id, status },
  })
  return { ok: true }
}

export async function updatePlanProcedureStatusAction(
  planId: string,
  procedureId: string,
  status: string
): Promise<{ ok?: boolean; error?: string }> {
  const user = await requirePermission("treatmentPlans:edit")
  if (!PROC_STATUSES.includes(status as (typeof PROC_STATUSES)[number])) return { error: "invalid" }
  const item = await prisma.treatmentPlanProcedure.findFirst({
    where: { id: procedureId, planId },
    select: { id: true, plan: { select: { patientId: true } } },
  })
  if (!item) return { error: "not_found" }
  await prisma.treatmentPlanProcedure.update({ where: { id: procedureId }, data: { status: status as never } })
  await logAudit({
    userId: user.id,
    action: "STATUS",
    module: "TreatmentPlans",
    recordId: item.plan.patientId,
    newValue: { planId, procedureId, status },
  })
  return { ok: true }
}

// ---------- Procedure catalog ----------

const procedureSchema = z.object({
  id: z.string().optional(),
  code: z.string().trim().min(1),
  nameEn: z.string().trim().min(1),
  nameAr: z.string().trim().min(1),
  category: z.string().trim().max(100).optional(),
  durationMinutes: z.string().optional(),
  price: z.string().optional(),
  cost: z.string().optional(),
  taxRate: z.string().optional(),
  isActive: z.boolean(),
})

export type ProcedureFormState = {
  ok?: boolean
  error?: "invalid" | "permission" | "server" | "duplicate"
}

export async function createProcedureAction(_prev: ProcedureFormState, formData: FormData): Promise<ProcedureFormState> {
  const user = await requirePermission("clinical:create")
  const str = (k: string) => {
    const v = formData.get(k)
    return typeof v === "string" ? v : ""
  }
  const parsed = procedureSchema.safeParse({
    code: str("code"),
    nameEn: str("nameEn"),
    nameAr: str("nameAr"),
    category: str("category") || undefined,
    durationMinutes: str("durationMinutes") || undefined,
    price: str("price") || undefined,
    cost: str("cost") || undefined,
    taxRate: str("taxRate") || undefined,
    isActive: formData.get("isActive") === "on",
  })
  if (!parsed.success) return { error: "invalid" }
  try {
    await prisma.procedure.create({
      data: {
        code: parsed.data.code.trim(),
        nameEn: parsed.data.nameEn.trim(),
        nameAr: parsed.data.nameAr.trim(),
        category: parsed.data.category ?? null,
        durationMinutes: parsed.data.durationMinutes ? Number(parsed.data.durationMinutes) : null,
        price: new Prisma.Decimal(parsed.data.price ?? "0").toNumber(),
        cost: new Prisma.Decimal(parsed.data.cost ?? "0").toNumber(),
        taxRate: new Prisma.Decimal(parsed.data.taxRate ?? "0").toNumber(),
        isActive: parsed.data.isActive,
      },
    })
  } catch {
    return { error: "duplicate" }
  }
  await logAudit({ userId: user.id, action: "CREATE", module: "Procedures", newValue: { code: parsed.data.code } })
  return { ok: true }
}

export async function updateProcedureAction(_prev: ProcedureFormState, formData: FormData): Promise<ProcedureFormState> {
  const user = await requirePermission("clinical:edit")
  const str = (k: string) => {
    const v = formData.get(k)
    return typeof v === "string" ? v : ""
  }
  const parsed = procedureSchema.safeParse({
    id: str("id") || undefined,
    code: str("code"),
    nameEn: str("nameEn"),
    nameAr: str("nameAr"),
    category: str("category") || undefined,
    durationMinutes: str("durationMinutes") || undefined,
    price: str("price") || undefined,
    cost: str("cost") || undefined,
    taxRate: str("taxRate") || undefined,
    isActive: formData.get("isActive") === "on",
  })
  if (!parsed.success || !parsed.data.id) return { error: "invalid" }
  try {
    await prisma.procedure.update({
      where: { id: parsed.data.id },
      data: {
        code: parsed.data.code.trim(),
        nameEn: parsed.data.nameEn.trim(),
        nameAr: parsed.data.nameAr.trim(),
        category: parsed.data.category ?? null,
        durationMinutes: parsed.data.durationMinutes ? Number(parsed.data.durationMinutes) : null,
        price: new Prisma.Decimal(parsed.data.price ?? "0").toNumber(),
        cost: new Prisma.Decimal(parsed.data.cost ?? "0").toNumber(),
        taxRate: new Prisma.Decimal(parsed.data.taxRate ?? "0").toNumber(),
        isActive: parsed.data.isActive,
      },
    })
  } catch {
    return { error: "duplicate" }
  }
  await logAudit({ userId: user.id, action: "UPDATE", module: "Procedures", newValue: { code: parsed.data.code } })
  return { ok: true }
}
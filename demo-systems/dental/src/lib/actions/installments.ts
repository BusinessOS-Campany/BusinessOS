"use server"

import { z } from "zod"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { requirePermission } from "@/lib/dal"
import { logAudit } from "@/lib/audit"
import { INSTALLMENT_STATUSES } from "@/lib/constants/billing"

const installmentRowSchema = z.object({
  amount: z.number().positive(),
  dueDate: z.string().min(1),
})

const planSchema = z.object({
  patientId: z.string().min(1),
  invoiceId: z.string().optional(),
  totalAmount: z.number().positive(),
  downPayment: z.number().min(0),
  notes: z.string().optional(),
  installments: z.array(installmentRowSchema).min(1),
})

export type PaymentPlanFormState = {
  ok?: boolean
  error?: "invalid" | "permission" | "not_found" | "server" | "duplicate_invoice"
}

export type InstallmentFormState = {
  ok?: boolean
  error?: "invalid" | "permission" | "not_found" | "server" | "amount_exceeds" | "closed"
}

function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export async function createPaymentPlanAction(
  _prev: PaymentPlanFormState,
  formData: FormData
): Promise<PaymentPlanFormState> {
  const user = await requirePermission("installments:create")

  const str = (k: string) => {
    const v = formData.get(k)
    return typeof v === "string" ? v : ""
  }

  const amounts = formData.getAll("amount") as string[]
  const dueDates = formData.getAll("dueDate") as string[]

  const installments = amounts
    .map((amount, i) => ({ amount: num(amount), dueDate: dueDates[i] ?? "" }))
    .filter((r) => r.amount > 0 && r.dueDate)

  const parsed = planSchema.safeParse({
    patientId: str("patientId"),
    invoiceId: str("invoiceId") || undefined,
    totalAmount: num(str("totalAmount")),
    downPayment: num(str("downPayment")),
    notes: str("notes") || undefined,
    installments,
  })
  if (!parsed.success) return { error: "invalid" }

  const patient = await prisma.patient.findFirst({
    where: { id: parsed.data.patientId, deletedAt: null },
    select: { id: true },
  })
  if (!patient) return { error: "not_found" }

  if (parsed.data.invoiceId) {
    const existing = await prisma.paymentPlan.findUnique({
      where: { invoiceId: parsed.data.invoiceId },
      select: { id: true },
    })
    if (existing) return { error: "duplicate_invoice" }
  }

  try {
    await prisma.$transaction(async (tx) => {
      const down = new Prisma.Decimal(parsed.data.downPayment)
      const total = new Prisma.Decimal(parsed.data.totalAmount)
      const paid = down.greaterThan(total) ? total : down
      const remaining = total.minus(paid)

      const plan = await tx.paymentPlan.create({
        data: {
          patientId: parsed.data.patientId,
          branchId: user.branchId,
          invoiceId: parsed.data.invoiceId ?? null,
          totalAmount: total,
          downPayment: paid,
          paidAmount: paid,
          remainingAmount: remaining,
          notes: parsed.data.notes?.trim() || null,
        },
        select: { id: true },
      })

      for (const row of parsed.data.installments) {
        await tx.installment.create({
          data: {
            planId: plan.id,
            amount: new Prisma.Decimal(row.amount),
            dueDate: new Date(row.dueDate),
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
    module: "Installments",
    recordId: patient.id,
    newValue: { installmentCount: parsed.data.installments.length },
  })

  return { ok: true }
}

export async function payInstallmentAction(
  installmentId: string,
  amount: number
): Promise<InstallmentFormState> {
  const user = await requirePermission("installments:edit")

  const amt = new Prisma.Decimal(num(amount))
  if (amt.lessThanOrEqualTo(0)) return { error: "invalid" }

  try {
    await prisma.$transaction(async (tx) => {
      const inst = await tx.installment.findUnique({
        where: { id: installmentId },
        select: { id: true, planId: true, amount: true, paidAmount: true, status: true },
      })
      if (!inst) throw new Error("not_found")
      if (inst.status === "CANCELLED") throw new Error("closed")

      const remainingInst = inst.amount.minus(inst.paidAmount)
      const pay = amt.greaterThan(remainingInst) ? remainingInst : amt
      const newPaid = inst.paidAmount.plus(pay)

      await tx.installment.update({
        where: { id: installmentId },
        data: {
          paidAmount: newPaid,
          paidAt: new Date(),
          receivedById: user.id,
          status: newPaid.greaterThanOrEqualTo(inst.amount) ? ("PAID" as never) : ("PENDING" as never),
        },
      })

      const plan = await tx.paymentPlan.findUniqueOrThrow({
        where: { id: inst.planId },
        select: { id: true, totalAmount: true, paidAmount: true },
      })
      const planPaid = plan.paidAmount.plus(pay)
      const planRemaining = plan.totalAmount.minus(planPaid)
      await tx.paymentPlan.update({
        where: { id: plan.id },
        data: {
          paidAmount: planPaid,
          remainingAmount: planRemaining.greaterThanOrEqualTo(0) ? planRemaining : 0,
        },
      })
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "server"
    if (msg === "not_found") return { error: "not_found" }
    if (msg === "closed") return { error: "closed" }
    return { error: "server" }
  }

  await logAudit({
    userId: user.id,
    action: "PAYMENT",
    module: "Installments",
    recordId: installmentId,
    newValue: { amount: String(amt) },
  })

  return { ok: true }
}

export async function cancelInstallmentAction(
  installmentId: string
): Promise<{ ok?: boolean; error?: string }> {
  const user = await requirePermission("installments:edit")
  const inst = await prisma.installment.findUnique({ where: { id: installmentId }, select: { id: true } })
  if (!inst) return { error: "not_found" }
  await prisma.installment.update({ where: { id: installmentId }, data: { status: "CANCELLED" as never } })
  await logAudit({
    userId: user.id,
    action: "STATUS",
    module: "Installments",
    recordId: installmentId,
    newValue: { status: "CANCELLED" },
  })
  return { ok: true }
}

export async function updateInstallmentStatusAction(
  installmentId: string,
  status: string
): Promise<{ ok?: boolean; error?: string }> {
  const user = await requirePermission("installments:edit")
  if (!INSTALLMENT_STATUSES.includes(status as (typeof INSTALLMENT_STATUSES)[number])) {
    return { error: "invalid" }
  }
  const inst = await prisma.installment.findUnique({ where: { id: installmentId }, select: { id: true } })
  if (!inst) return { error: "not_found" }
  await prisma.installment.update({ where: { id: installmentId }, data: { status: status as never } })
  await logAudit({
    userId: user.id,
    action: "STATUS",
    module: "Installments",
    recordId: installmentId,
    newValue: { status },
  })
  return { ok: true }
}
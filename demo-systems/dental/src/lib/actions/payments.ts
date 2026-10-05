"use server"

import { z } from "zod"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { requirePermission } from "@/lib/dal"
import { logAudit } from "@/lib/audit"
import { PAYMENT_METHODS } from "@/lib/constants/billing"

const paymentSchema = z.object({
  patientId: z.string().min(1),
  invoiceId: z.string().optional(),
  amount: z.number().positive(),
  method: z.enum(PAYMENT_METHODS),
  reference: z.string().optional(),
  paidAt: z.string().optional(),
  notes: z.string().optional(),
})

export type PaymentFormState = {
  ok?: boolean
  error?: "invalid" | "permission" | "not_found" | "server" | "amount_exceeds" | "invoice_closed"
}

function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export async function recordPaymentAction(
  _prev: PaymentFormState,
  formData: FormData
): Promise<PaymentFormState> {
  const user = await requirePermission("payments:create")

  const str = (k: string) => {
    const v = formData.get(k)
    return typeof v === "string" ? v : ""
  }

  const parsed = paymentSchema.safeParse({
    patientId: str("patientId"),
    invoiceId: str("invoiceId") || undefined,
    amount: num(str("amount")),
    method: str("method") || "CASH",
    reference: str("reference") || undefined,
    paidAt: str("paidAt") || undefined,
    notes: str("notes") || undefined,
  })
  if (!parsed.success) return { error: "invalid" }

  const patient = await prisma.patient.findFirst({
    where: { id: parsed.data.patientId, deletedAt: null },
    select: { id: true, branchId: true },
  })
  if (!patient) return { error: "not_found" }

  try {
    await prisma.$transaction(async (tx) => {
      let invoiceToUpdate: { id: string; status: string; paid: Prisma.Decimal; total: Prisma.Decimal } | undefined

      if (parsed.data.invoiceId) {
const invoice = await tx.invoice.findFirst({
          where: {
            id: parsed.data.invoiceId,
            patientId: patient.id,
            ...(user.branchId ? { branchId: user.branchId } : {}),
          },
          select: { id: true, status: true, paid: true, total: true },
        })
        if (!invoice) throw new Error("not_found")
        if (invoice.status === "CANCELLED" || invoice.status === "REFUNDED") {
          throw new Error("invoice_closed")
        }
        const amount = new Prisma.Decimal(parsed.data.amount)
        const remaining = invoice.total.minus(invoice.paid)
        if (amount.greaterThan(remaining)) throw new Error("amount_exceeds")
        invoiceToUpdate = invoice
      }

      await tx.payment.create({
        data: {
          invoiceId: parsed.data.invoiceId ?? null,
          patientId: patient.id,
          branchId: patient.branchId ?? user.branchId,
          amount: new Prisma.Decimal(parsed.data.amount),
          method: parsed.data.method as never,
          reference: parsed.data.reference || null,
          paidAt: parsed.data.paidAt ? new Date(parsed.data.paidAt) : new Date(),
          receivedById: user.id,
          notes: parsed.data.notes?.trim() || null,
        },
      })

      if (invoiceToUpdate) {
        const newPaid = invoiceToUpdate.paid.plus(parsed.data.amount)
        const newRemaining = invoiceToUpdate.total.minus(newPaid)
        const newStatus =
          newRemaining.lessThanOrEqualTo(0)
            ? "PAID"
            : invoiceToUpdate.status === "ISSUED" || invoiceToUpdate.status === "DRAFT"
              ? "PARTIALLY_PAID"
              : invoiceToUpdate.status
        await tx.invoice.update({
          where: { id: invoiceToUpdate.id },
          data: {
            paid: newPaid,
            remaining: newRemaining,
            status: newStatus as never,
          },
        })
      }
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "server"
    if (msg === "not_found") return { error: "not_found" }
    if (msg === "amount_exceeds") return { error: "amount_exceeds" }
    if (msg === "invoice_closed") return { error: "invoice_closed" }
    return { error: "server" }
  }

  await logAudit({
    userId: user.id,
    action: "CREATE",
    module: "Payments",
    recordId: patient.id,
    newValue: { amount: num(str("amount")), invoiceId: parsed.data.invoiceId ?? null },
  })

  return { ok: true }
}

export async function refundPaymentAction(id: string): Promise<{ ok?: boolean; error?: string }> {
  const user = await requirePermission("payments:refund")
  const payment = await prisma.payment.findUnique({
    where: { id },
    select: { id: true, invoiceId: true, amount: true },
  })
  if (!payment) return { error: "not_found" }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.payment.delete({ where: { id } })
      if (payment.invoiceId) {
        const invoice = await tx.invoice.findUnique({
          where: { id: payment.invoiceId },
          select: { id: true, paid: true, total: true, remaining: true },
        })
        if (invoice) {
          const newPaid = invoice.paid.minus(payment.amount).greaterThanOrEqualTo(0)
            ? invoice.paid.minus(payment.amount)
            : new Prisma.Decimal(0)
          const newRemaining = invoice.total.minus(newPaid)
          const newStatus =
            newRemaining.lessThanOrEqualTo(0)
              ? "PAID"
              : newPaid.greaterThan(0)
                ? "PARTIALLY_PAID"
                : "ISSUED"
          await tx.invoice.update({
            where: { id: invoice.id },
            data: { paid: newPaid, remaining: newRemaining, status: newStatus as never },
          })
        }
      }
    })
  } catch {
    return { error: "server" }
  }

  await logAudit({
    userId: user.id,
    action: "REFUND",
    module: "Payments",
    recordId: payment.id,
    newValue: { amount: String(payment.amount) },
  })

  return { ok: true }
}
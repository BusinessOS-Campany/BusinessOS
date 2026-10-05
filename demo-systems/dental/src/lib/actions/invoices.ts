"use server"

import { z } from "zod"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { requirePermission } from "@/lib/dal"
import { logAudit } from "@/lib/audit"
import { INVOICE_STATUSES } from "@/lib/constants/billing"

const itemSchema = z.object({
  description: z.string().trim().min(1),
  procedureId: z.string().optional(),
  quantity: z.number().int().min(1).max(9999),
  unitPrice: z.number().min(0),
  discount: z.number().min(0),
  toothNumber: z.number().int().min(1).max(48).optional(),
})

const invoiceSchema = z.object({
  patientId: z.string().min(1),
  dentistId: z.string().optional(),
  discount: z.number().min(0),
  taxRate: z.number().min(0),
  issueDate: z.string().optional(),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(itemSchema).min(1),
})

export type InvoiceFormState = {
  ok?: boolean
  error?: "invalid" | "permission" | "not_found" | "server" | "no_items"
}

function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

async function generateInvoiceNo(): Promise<string> {
  const now = new Date()
  const prefix =
    `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-`
  for (let i = 0; i < 5; i++) {
    const last = await prisma.invoice.findFirst({
      where: { invoiceNo: { startsWith: prefix } },
      orderBy: { invoiceNo: "desc" },
      select: { invoiceNo: true },
    })
    const seq = last ? Number(last.invoiceNo.split("-").pop() ?? "0") + 1 : 1
    const invoiceNo = `${prefix}${String(seq).padStart(4, "0")}`
    const exists = await prisma.invoice.findUnique({ where: { invoiceNo }, select: { id: true } })
    if (!exists) return invoiceNo
  }
  return `${prefix}${String(Date.now()).slice(-6)}`
}

export async function createInvoiceAction(
  _prev: InvoiceFormState,
  formData: FormData
): Promise<InvoiceFormState> {
  const user = await requirePermission("invoices:create")

  const str = (k: string) => {
    const v = formData.get(k)
    return typeof v === "string" ? v : ""
  }

  const descriptions = formData.getAll("description") as string[]
  const quantities = formData.getAll("quantity") as string[]
  const prices = formData.getAll("unitPrice") as string[]
  const discounts = formData.getAll("lineDiscount") as string[]
  const procedureIds = formData.getAll("procedureId") as string[]
  const tooths = formData.getAll("toothNumber") as string[]

  const items = descriptions.map((description, i) => ({
    description,
    procedureId: procedureIds[i] || undefined,
    quantity: Math.round(num(quantities[i])) || 1,
    unitPrice: num(prices[i]),
    discount: num(discounts[i]),
    toothNumber: Math.round(num(tooths[i])) || undefined,
  }))

  const parsed = invoiceSchema.safeParse({
    patientId: str("patientId"),
    dentistId: str("dentistId") || undefined,
    discount: num(str("discount")),
    taxRate: num(str("taxRate")),
    issueDate: str("issueDate") || undefined,
    dueDate: str("dueDate") || undefined,
    notes: str("notes") || undefined,
    items,
  })

  if (!parsed.success) return { error: "invalid" }
  if (!parsed.data.items.some((it) => it.unitPrice >= 0 && it.description)) return { error: "no_items" }

  const patient = await prisma.patient.findFirst({
    where: { id: parsed.data.patientId, deletedAt: null },
    select: { id: true, branchId: true },
  })
  if (!patient) return { error: "not_found" }

  try {
    await prisma.$transaction(async (tx) => {
      const invoiceNo = await generateInvoiceNo()

      let subtotal = new Prisma.Decimal(0)
      for (const item of parsed.data.items) {
        const line = new Prisma.Decimal(item.unitPrice).mul(item.quantity).minus(item.discount)
        subtotal = subtotal.plus(line.greaterThanOrEqualTo(0) ? line : 0)
      }

      const discount = new Prisma.Decimal(parsed.data.discount)
      const base = subtotal.minus(discount).greaterThanOrEqualTo(0)
        ? subtotal.minus(discount)
        : subtotal
      const tax = base.mul(parsed.data.taxRate).div(100)
      const total = base.plus(tax).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)

      const created = await tx.invoice.create({
        data: {
          invoiceNo,
          patientId: patient.id,
          branchId: patient.branchId ?? user.branchId ?? "",
          dentistId: parsed.data.dentistId ?? null,
          status: "ISSUED" as never,
          subtotal: subtotal.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
          discount: discount.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
          tax: tax.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
          total,
          paid: 0,
          remaining: total,
          issueDate: parsed.data.issueDate ? new Date(parsed.data.issueDate) : new Date(),
          dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
          notes: parsed.data.notes?.trim() || null,
        },
        select: { id: true },
      })

      for (const item of parsed.data.items) {
        const unitPrice = new Prisma.Decimal(item.unitPrice)
        const lineTotal = unitPrice.mul(item.quantity).minus(item.discount)
        await tx.invoiceItem.create({
          data: {
            invoiceId: created.id,
            procedureId: item.procedureId || null,
            description: item.description,
            toothNumber: item.toothNumber ?? null,
            quantity: item.quantity,
            unitPrice,
            discount: new Prisma.Decimal(item.discount),
            taxRate: 0,
            total: lineTotal.greaterThanOrEqualTo(0) ? lineTotal.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP) : 0,
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
    module: "Invoices",
    recordId: patient.id,
    newValue: { itemCount: parsed.data.items.length },
  })

  return { ok: true }
}

export async function updateInvoiceStatusAction(
  id: string,
  status: string
): Promise<{ ok?: boolean; error?: string }> {
  const user = await requirePermission("invoices:edit")
  if (!INVOICE_STATUSES.includes(status as (typeof INVOICE_STATUSES)[number])) {
    return { error: "invalid" }
  }
  const invoice = await prisma.invoice.findUnique({ where: { id }, select: { id: true } })
  if (!invoice) return { error: "not_found" }
  await prisma.invoice.update({ where: { id }, data: { status: status as never } })
  await logAudit({
    userId: user.id,
    action: "STATUS",
    module: "Invoices",
    recordId: id,
    newValue: { status },
  })
  return { ok: true }
}

export async function refundInvoiceAction(id: string): Promise<{ ok?: boolean; error?: string }> {
  const user = await requirePermission("invoices:refund")
  const invoice = await prisma.invoice.findUnique({ where: { id }, select: { id: true } })
  if (!invoice) return { error: "not_found" }
  await prisma.invoice.update({ where: { id }, data: { status: "REFUNDED" as never } })
  await logAudit({
    userId: user.id,
    action: "REFUND",
    module: "Invoices",
    recordId: id,
  })
  return { ok: true }
}

export async function deleteInvoiceAction(id: string): Promise<{ ok?: boolean; error?: string }> {
  const user = await requirePermission("invoices:delete")
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    select: { id: true, status: true, payments: { select: { id: true }, take: 1 } },
  })
  if (!invoice) return { error: "not_found" }
  if (invoice.status !== "DRAFT" && invoice.status !== "CANCELLED") return { error: "invalid" }
  if (invoice.payments.length > 0) return { error: "invalid" }
  await prisma.invoice.delete({ where: { id } })
  await logAudit({
    userId: user.id,
    action: "DELETE",
    module: "Invoices",
    recordId: id,
  })
  return { ok: true }
}
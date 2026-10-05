"use server"

import { z } from "zod"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { requirePermission } from "@/lib/dal"
import { logAudit } from "@/lib/audit"
import { EXPENSE_CATEGORIES } from "@/lib/constants/billing"

const expenseSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  amount: z.number().positive(),
  description: z.string().trim().max(500).optional(),
  expenseDate: z.string().optional(),
  notes: z.string().trim().max(2000).optional(),
})

export type ExpenseFormState = {
  ok?: boolean
  error?: "invalid" | "permission" | "not_found" | "server"
}

function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function parse(data: FormData) {
  const str = (k: string) => {
    const v = data.get(k)
    return typeof v === "string" ? v : ""
  }
  return expenseSchema.safeParse({
    category: str("category") || "OTHER",
    amount: num(str("amount")),
    description: str("description") || undefined,
    expenseDate: str("expenseDate") || undefined,
    notes: str("notes") || undefined,
  })
}

export async function createExpenseAction(
  _prev: ExpenseFormState,
  formData: FormData
): Promise<ExpenseFormState> {
  const user = await requirePermission("expenses:create")
  const parsed = parse(formData)
  if (!parsed.success) return { error: "invalid" }

  try {
    await prisma.expense.create({
      data: {
        branchId: user.branchId ?? "",
        category: parsed.data.category as never,
        amount: new Prisma.Decimal(parsed.data.amount),
        description: parsed.data.description ?? null,
        expenseDate: parsed.data.expenseDate ? new Date(parsed.data.expenseDate) : new Date(),
        paidById: user.id,
        notes: parsed.data.notes ?? null,
      },
    })
  } catch {
    return { error: "server" }
  }

  await logAudit({
    userId: user.id,
    action: "CREATE",
    module: "Expenses",
    newValue: { category: parsed.data.category, amount: String(parsed.data.amount) },
  })

  return { ok: true }
}

export async function updateExpenseAction(
  _prev: ExpenseFormState,
  formData: FormData
): Promise<ExpenseFormState> {
  const user = await requirePermission("expenses:edit")
  const parsed = parse(formData)
  if (!parsed.success) return { error: "invalid" }

  const id = formData.get("id")
  if (typeof id !== "string" || !id) return { error: "invalid" }

  const existing = await prisma.expense.findUnique({ where: { id }, select: { id: true } })
  if (!existing) return { error: "not_found" }

  try {
    await prisma.expense.update({
      where: { id },
      data: {
        category: parsed.data.category as never,
        amount: new Prisma.Decimal(parsed.data.amount),
        description: parsed.data.description ?? null,
        expenseDate: parsed.data.expenseDate ? new Date(parsed.data.expenseDate) : new Date(),
        notes: parsed.data.notes ?? null,
      },
    })
  } catch {
    return { error: "server" }
  }

  await logAudit({
    userId: user.id,
    action: "UPDATE",
    module: "Expenses",
    recordId: id,
    newValue: { category: parsed.data.category, amount: String(parsed.data.amount) },
  })

  return { ok: true }
}

export async function deleteExpenseAction(id: string): Promise<{ ok?: boolean; error?: string }> {
  const user = await requirePermission("expenses:delete")
  const existing = await prisma.expense.findUnique({ where: { id }, select: { id: true } })
  if (!existing) return { error: "not_found" }
  await prisma.expense.delete({ where: { id } })
  await logAudit({ userId: user.id, action: "DELETE", module: "Expenses", recordId: id })
  return { ok: true }
}
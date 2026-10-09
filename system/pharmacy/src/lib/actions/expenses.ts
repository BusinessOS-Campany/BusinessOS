"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/dal";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { toMinor } from "@/lib/format";

const expenseSchema = z.object({
  categoryId: z.string().optional().nullable(),
  description: z.string().min(1),
  amount: z.coerce.number().positive(),
  paidAt: z.string().optional().nullable(),
  method: z.string().default("cash"),
  cashAccountId: z.string().optional().nullable(),
});

export async function createExpense(input: z.infer<typeof expenseSchema>) {
  const user = await requirePermission("expenses:create");
  const data = expenseSchema.parse(input);
  const amount = toMinor(data.amount);

  await prisma.$transaction(async (tx) => {
    const exp = await tx.expense.create({
      data: {
        categoryId: data.categoryId || null,
        amount,
        description: data.description,
        paidAt: data.paidAt ? new Date(data.paidAt) : new Date(),
        method: data.method,
        createdByUserId: user.id,
      },
    });
    if (data.cashAccountId) {
      const session = await tx.cashSession.findFirst({ where: { cashAccountId: data.cashAccountId, status: "open" } });
      await tx.cashMovement.create({
        data: {
          cashAccountId: data.cashAccountId,
          sessionId: session?.id ?? null,
          delta: -amount,
          reason: "expense",
          refType: "expense",
          refId: exp.id,
          createdByUserId: user.id,
        },
      });
    }
  });

  await recordAudit(user.id, AUDIT_ACTIONS.CREATE, "expense", null, { after: { amount: amount.toString(), description: data.description } });
  revalidatePath("/expenses");
  revalidatePath("/cash");
  return { ok: true };
}

export async function deleteExpense(id: string) {
  const user = await requirePermission("expenses:edit");
  await prisma.expense.delete({ where: { id } });
  await recordAudit(user.id, AUDIT_ACTIONS.DELETE, "expense", id);
  revalidatePath("/expenses");
  return { ok: true };
}

const catSchema = z.object({
  id: z.string().optional(),
  nameAr: z.string().min(1),
  nameEn: z.string().optional().nullable(),
});

export async function saveExpenseCategory(input: z.infer<typeof catSchema>) {
  await requirePermission("expenses:view");
  const data = catSchema.parse(input);
  if (data.id) {
    await prisma.expenseCategory.update({ where: { id: data.id }, data: { nameAr: data.nameAr, nameEn: data.nameEn || null } });
  } else {
    await prisma.expenseCategory.create({ data: { nameAr: data.nameAr, nameEn: data.nameEn || null } });
  }
  revalidatePath("/expenses");
  return { ok: true };
}

export async function deleteExpenseCategory(id: string) {
  await requirePermission("expenses:edit");
  await prisma.expenseCategory.delete({ where: { id } });
  revalidatePath("/expenses");
  return { ok: true };
}
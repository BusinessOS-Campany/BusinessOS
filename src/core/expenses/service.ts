import { z } from "zod";
import type { PrismaClient, Prisma } from "@/core/db/generated/prisma/client";
import { ApiError } from "@/core/http/api";
import { writeAuditLog } from "@/core/audit/service";

export const expenseSchema = z.object({
  categoryId: z.string().min(1).nullable().optional(),
  amount: z.number().int().positive(),
  cashAccountId: z.string().min(1).nullable().optional(),
  note: z.string().max(500).optional(),
  spentAt: z.coerce.date().optional(),
});

export type ExpenseInput = z.infer<typeof expenseSchema>;

export interface TenantRef {
  organizationId: string;
  userId?: string;
}

/** Records an expense; when funded from a cash account, moves cash out too. */
export async function createExpense(
  prisma: PrismaClient,
  tenant: TenantRef,
  input: ExpenseInput,
): Promise<{ expenseId: string }> {
  return prisma.$transaction(async (tx) => {
    if (input.categoryId) {
      const cat = await tx.expenseCategory.findFirst({
        where: { id: input.categoryId, organizationId: tenant.organizationId },
      });
      if (!cat) throw ApiError.notFound("Expense category not found");
    }

    let account: { id: string } | null = null;
    if (input.cashAccountId) {
      account = await tx.cashAccount.findFirst({
        where: { id: input.cashAccountId, organizationId: tenant.organizationId },
        select: { id: true },
      });
      if (!account) throw ApiError.notFound("Cash account not found");
    }

    const expense = await tx.expense.create({
      data: {
        organizationId: tenant.organizationId,
        categoryId: input.categoryId ?? undefined,
        amount: BigInt(input.amount),
        cashAccountId: account?.id,
        note: input.note,
        spentAt: input.spentAt ?? new Date(),
        createdByUserId: tenant.userId,
      },
      select: { id: true },
    });

    if (account) {
      await tx.cashMovement.create({
        data: {
          organizationId: tenant.organizationId,
          accountId: account.id,
          delta: -BigInt(input.amount),
          reason: "expense",
          refType: "expense",
          refId: expense.id,
          note: input.note,
          createdByUserId: tenant.userId,
        },
      });
    }

    await writeAuditLog(tx, { organizationId: tenant.organizationId }, {
      action: "expense.created",
      entityType: "expense",
      entityId: expense.id,
      after: { amount: String(input.amount) },
    });

    return { expenseId: expense.id };
  });
}

/* ── Form-level variants shared by /api/v1/expenses + /sama-center/expenses ── */

export const expenseFormSchema = z.object({
  /** Free-text description (stored on expense.note). */
  description: z.string().max(500).optional(),
  /** Free-text category name — auto-created (and deduped) per org. */
  category: z.string().max(120).optional(),
  amount: z.number().int().positive(),
  cashAccountId: z.string().min(1).nullable().optional(),
  spentAt: z.coerce.date().optional(),
});

export type ExpenseFormInput = z.infer<typeof expenseFormSchema>;

/** Client-facing expense row: virtual fields derived for the form UI. */
export interface ExpenseListItem {
  id: string;
  description: string;
  categoryId: string | null;
  categoryName: string | null;
  amount: number;
  date: string;
  paymentMethod: string;
  status: string;
  note: string | null;
  cashAccountId: string | null;
  spentAt: string;
}

/** Expense categories of an org (id/nameAr/nameEn) for filter dropdowns. */
export async function listExpenseCategories(
  prisma: PrismaClient,
  organizationId: string,
): Promise<
  { id: string; nameAr: string; nameEn: string | null }[]
> {
  return prisma.expenseCategory.findMany({
    where: { organizationId },
    orderBy: { nameAr: "asc" },
  });
}

/**
 * Form-oriented expense creation: takes a free-text `category` (created once
 * and deduped by arabic name within the org), a `description`, and the amount.
 * Delegates the funded cash movement + audit trail to createExpense.
 */
export async function createExpenseForm(
  prisma: PrismaClient,
  tenant: TenantRef,
  input: ExpenseFormInput,
): Promise<{ expenseId: string }> {
  const category = input.category?.trim();
  let categoryId: string | undefined;
  if (category) {
    const existing = await prisma.expenseCategory.findFirst({
      where: { organizationId: tenant.organizationId, nameAr: { equals: category, mode: "insensitive" } },
      select: { id: true },
    });
    if (existing) {
      categoryId = existing.id;
    } else {
      const created = await prisma.expenseCategory.create({
        data: { organizationId: tenant.organizationId, nameAr: category },
        select: { id: true },
      });
      categoryId = created.id;
    }
  }

  return createExpense(prisma, tenant, {
    categoryId,
    amount: input.amount,
    cashAccountId: input.cashAccountId,
    note: input.description,
    spentAt: input.spentAt,
  });
}

/** Expense ledger query with the client form shape (search + paging). */
export async function listExpenses(
  prisma: PrismaClient,
  tenant: TenantRef,
  opts?: { search?: string; page?: number; pageSize?: number },
): Promise<{ total: number; items: ExpenseListItem[] }> {
  const page = Math.max(1, opts?.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts?.pageSize ?? 50));

  const where: Prisma.expenseWhereInput = { organizationId: tenant.organizationId };
  const search = opts?.search?.trim();
  if (search) {
    where.note = { contains: search, mode: "insensitive" };
  }

  const [rows, total] = await Promise.all([
    prisma.expense.findMany({
      where,
      orderBy: { spentAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.expense.count({ where }),
  ]);

  const catIds = [...new Set(rows.map((r) => r.categoryId).filter((id): id is string => Boolean(id)))];
  let categoryNames = new Map<string, string>();
  if (catIds.length > 0) {
    const cats = await prisma.expenseCategory.findMany({
      where: { id: { in: catIds } },
      select: { id: true, nameAr: true },
    });
    categoryNames = new Map(cats.map((c) => [c.id, c.nameAr]));
  }

  const items: ExpenseListItem[] = rows.map((r) => ({
    id: r.id,
    description: r.note ?? "",
    categoryId: r.categoryId,
    categoryName: r.categoryId ? (categoryNames.get(r.categoryId) ?? null) : null,
    amount: Number(r.amount),
    date: r.spentAt.toISOString(),
    paymentMethod: "cash",
    status: "approved",
    note: r.note,
    cashAccountId: r.cashAccountId,
    spentAt: r.spentAt.toISOString(),
  }));

  return { total, items };
}

/**
 * Updates an expense row. For funded expenses a signed "correction" movement
 * is appended so the cash account stays exact: delta = oldAmount - newAmount
 * (e.g. 1000 -> 400 adds +600 back).
 */
export async function updateExpenseForm(
  prisma: PrismaClient,
  tenant: TenantRef,
  id: string,
  patch: { amount?: number; note?: string; categoryId?: string | null; spentAt?: Date },
) {
  const existing = await prisma.expense.findFirst({
    where: { id, organizationId: tenant.organizationId },
  });
  if (!existing) throw ApiError.notFound("Expense not found");

  return prisma.$transaction(async (tx) => {
    const data: Prisma.expenseUpdateInput = {};
    if (patch.amount !== undefined) {
      const newAmount = BigInt(patch.amount);
      if (existing.cashAccountId) {
        await tx.cashMovement.create({
          data: {
            organizationId: tenant.organizationId,
            accountId: existing.cashAccountId,
            delta: existing.amount - newAmount,
            reason: "expense",
            refType: "expense",
            refId: id,
            note: existing.note ?? undefined,
            createdByUserId: tenant.userId,
          },
        });
      }
      data.amount = newAmount;
    }
    if (patch.note !== undefined) data.note = patch.note;
    if (patch.categoryId !== undefined) data.categoryId = patch.categoryId;
    if (patch.spentAt !== undefined) data.spentAt = patch.spentAt;

    const updated = await tx.expense.update({ where: { id }, data });
    void updated; // returned for the route envelope
    await writeAuditLog(tx, { organizationId: tenant.organizationId }, {
      action: "expense.updated",
      entityType: "expense",
      entityId: id,
      after: { amount: patch.amount !== undefined ? String(patch.amount) : undefined },
    });
    return updated;
  });
}

/**
 * Deletes an expense row. For funded expenses the cash movement is reversed
 * (delta = +amount) before the row is removed.
 */
export async function deleteExpenseRow(
  prisma: PrismaClient,
  tenant: TenantRef,
  id: string,
): Promise<{ deleted: boolean }> {
  const existing = await prisma.expense.findFirst({
    where: { id, organizationId: tenant.organizationId },
  });
  if (!existing) throw ApiError.notFound("Expense not found");

  return prisma.$transaction(async (tx) => {
    if (existing.cashAccountId) {
      await tx.cashMovement.create({
        data: {
          organizationId: tenant.organizationId,
          accountId: existing.cashAccountId,
          delta: existing.amount,
          reason: "expense",
          refType: "expense",
          refId: id,
          note: existing.note ?? undefined,
          createdByUserId: tenant.userId,
        },
      });
    }
    await tx.expense.delete({ where: { id } });
    await writeAuditLog(tx, { organizationId: tenant.organizationId }, {
      action: "expense.deleted",
      entityType: "expense",
      entityId: id,
    });
    return { deleted: true };
  });
}

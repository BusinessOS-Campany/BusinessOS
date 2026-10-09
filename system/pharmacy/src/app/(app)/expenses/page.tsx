import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/dal";
import { LANG_COOKIE, localeFrom } from "@/lib/i18n";
import { ExpensesClient } from "@/components/expenses/expenses-client";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  const cookieStore = await cookies();
  const locale = localeFrom(cookieStore.get(LANG_COOKIE)?.value);
  await requirePermission("expenses:view");

  const [expenses, categories, cashAccounts] = await Promise.all([
    prisma.expense.findMany({ orderBy: { paidAt: "desc" }, take: 300 }),
    prisma.expenseCategory.findMany({ orderBy: { nameAr: "asc" } }),
    prisma.cashAccount.findMany({ where: { isActive: true } }),
  ]);

  const catMap = new Map(categories.map((c) => [c.id, c]));
  const cashMap = new Map(cashAccounts.map((c) => [c.id, c]));

  const rows = expenses.map((e) => ({
    id: e.id,
    category: e.categoryId ? (catMap.get(e.categoryId) ? (locale === "ar" ? catMap.get(e.categoryId)!.nameAr : catMap.get(e.categoryId)!.nameEn ?? catMap.get(e.categoryId)!.nameAr) : "—") : "—",
    description: e.description ?? "—",
    amount: Number(e.amount) / 100,
    method: e.method,
    paidAt: e.paidAt.toISOString(),
  }));

  return (
    <ExpensesClient
      locale={locale}
      rows={rows}
      categories={categories.map((c) => ({ id: c.id, name: locale === "ar" ? c.nameAr : c.nameEn ?? c.nameAr }))}
      cashAccounts={cashAccounts.map((c) => ({ id: c.id, name: c.nameEn ?? c.nameAr }))}
    />
  );
}
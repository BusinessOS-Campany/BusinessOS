import { requirePermission } from "@/lib/dal"
import { prisma } from "@/lib/prisma"
import { cookies } from "next/headers"
import Link from "next/link"
import { Receipt } from "lucide-react"
import { LANG_COOKIE, localeFrom, type Locale } from "@/lib/i18n"
import { statusColor } from "@/lib/status-ui"
import { formatCurrency, formatDate } from "@/lib/format"
import { EXPENSE_CATEGORIES, expenseCategoryLabel } from "@/lib/constants/billing"
import { ExpenseFormDialog, type ExpenseLite } from "@/components/expenses/expense-form-dialog"
import { DeleteExpenseButton } from "@/components/expenses/delete-expense-button"
import { Pagination } from "@/components/patients/pagination"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type Params = { [key: string]: string | string[] | undefined }
type SearchParams = Promise<Params>

function sp(params: Params | undefined, key: string): string | undefined {
  const v = params?.[key]
  return typeof v === "string" ? v : undefined
}

const PER_PAGE = 15
const isCategory = (v: string): v is (typeof EXPENSE_CATEGORIES)[number] =>
  EXPENSE_CATEGORIES.includes(v as (typeof EXPENSE_CATEGORIES)[number])

export default async function ExpensesPage({ searchParams }: { searchParams?: SearchParams }) {
  const user = await requirePermission("expenses:view")
  const cookieStore = await cookies()
  const locale: Locale = localeFrom(cookieStore.get(LANG_COOKIE)?.value)
  const ar = locale === "ar"
  const url: Params = (await searchParams) ?? {}

  const q = sp(url, "q")?.trim() ?? ""
  const category = sp(url, "category") ?? ""
  const page = Math.max(1, Number(sp(url, "page")) || 1)

  const where = {
    ...(user.branchId ? { branchId: user.branchId } : {}),
    ...(category && isCategory(category) ? { category: category as never } : {}),
    ...(q ? { description: { contains: q, mode: "insensitive" as const } } : {}),
  }

  const [total, rows] = await Promise.all([
    prisma.expense.count({ where }),
    prisma.expense.findMany({
      where,
      orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      include: { paidBy: { select: { name: true, nameAr: true } } },
    }),
  ])

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))
  const preserved = new URLSearchParams()
  if (q) preserved.set("q", q)
  if (category) preserved.set("category", category)
  const preservedQuery = preserved.toString()

  return (
    <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{ar ? "المصاريف" : "Expenses"}</h1>
          <p className="text-sm text-muted-foreground">{total} {ar ? "مصروف" : "expenses"}</p>
        </div>
        {user.permissions.includes("expenses:create") && (
          <ExpenseFormDialog
            trigger={
              <Button>
                <Receipt className="h-4 w-4" />
                {ar ? "تسجيل مصروف" : "Record Expense"}
              </Button>
            }
          />
        )}
      </div>

      <Card className="overflow-hidden">
        <form method="GET" action="/expenses" className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <Input type="search" name="q" defaultValue={q} placeholder={ar ? "بحث بالوصف…" : "Search description…"} className="w-full" />
          </div>
          <select
            name="category"
            defaultValue={category}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">{ar ? "كل الفئات" : "All categories"}</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{expenseCategoryLabel(c, locale)}</option>
            ))}
          </select>
          <Button type="submit" variant="outline">{ar ? "تصفية" : "Filter"}</Button>
          {(q || category) && (
            <Button type="button" variant="ghost" asChild>
              <Link href="/expenses">{ar ? "مسح" : "Clear"}</Link>
            </Button>
          )}
        </form>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{ar ? "التاريخ" : "Date"}</TableHead>
                <TableHead>{ar ? "الفئة" : "Category"}</TableHead>
                <TableHead>{ar ? "الوصف" : "Description"}</TableHead>
                <TableHead className="text-end">{ar ? "المبلغ" : "Amount"}</TableHead>
                <TableHead>{ar ? "سجّلها" : "Recorded by"}</TableHead>
                {(user.permissions.includes("expenses:edit") || user.permissions.includes("expenses:delete")) && (
                  <TableHead className="text-end">{ar ? "إجراءات" : "Actions"}</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-16 text-center text-sm text-muted-foreground">{ar ? "لا توجد مصاريف" : "No expenses recorded"}</TableCell>
                </TableRow>
              ) : (
                rows.map((e) => {
                  const c = statusColor(e.category)
                  const lite: ExpenseLite = {
                    id: e.id,
                    category: e.category,
                    amount: String(e.amount),
                    description: e.description,
                    expenseDate: e.expenseDate.toISOString(),
                    notes: e.notes,
                  }
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="whitespace-nowrap">{formatDate(e.expenseDate, locale)}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs" style={{ borderColor: c.border, color: c.text, background: c.bg }}>
                          {expenseCategoryLabel(e.category, locale)}
                        </span>
                      </TableCell>
                      <TableCell>{e.description ?? "—"}</TableCell>
                      <TableCell className="text-end tabular-nums font-medium">{formatCurrency(e.amount)}</TableCell>
                      <TableCell>{e.paidBy ? (ar && e.paidBy.nameAr ? e.paidBy.nameAr : e.paidBy.name) : "—"}</TableCell>
                      {(user.permissions.includes("expenses:edit") || user.permissions.includes("expenses:delete")) && (
                        <TableCell className="text-end">
                          <div className="flex items-center justify-end gap-2">
                            {user.permissions.includes("expenses:edit") && (
                              <ExpenseFormDialog existing={lite} trigger={<Button variant="outline" size="sm">{ar ? "تعديل" : "Edit"}</Button>} />
                            )}
                            {user.permissions.includes("expenses:delete") && <DeleteExpenseButton expenseId={e.id} />}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

        <Pagination page={page} totalPages={totalPages} totalItems={total} perPage={PER_PAGE} basePath="/expenses" preservedQuery={preservedQuery} />
      </Card>
    </div>
  )
}
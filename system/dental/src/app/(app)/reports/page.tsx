import { requirePermission } from "@/lib/dal"
import { prisma } from "@/lib/prisma"
import { cookies } from "next/headers"
import { LANG_COOKIE, localeFrom, type Locale } from "@/lib/i18n"
import { formatCurrency, formatNumber } from "@/lib/format"
import { expenseCategoryLabel } from "@/lib/constants/billing"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Download } from "lucide-react"

export const dynamic = "force-dynamic"

function dayStart(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function monthStart(): Date {
  const d = new Date()
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d
}

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`

export default async function ReportsPage() {
  const user = await requirePermission("reports:view")
  const cookieStore = await cookies()
  const locale: Locale = localeFrom(cookieStore.get(LANG_COOKIE)?.value)
  const ar = locale === "ar"
  const scope = user.branchId ? { branchId: user.branchId } : {}

  const today = dayStart()
  const month = monthStart()
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5)
  sixMonthsAgo.setDate(1)
  sixMonthsAgo.setHours(0, 0, 0, 0)

  const whereAll = { patient: { deletedAt: null }, ...scope }

  const [
    revenueToday,
    revenueMonth,
    invoiceCounts,
    overdueInstallments,
    monthlyPayments,
    topProcedures,
    topPatients,
    expensesByCategory,
  ] = await Promise.all([
    prisma.payment.aggregate({
      where: { ...whereAll, paidAt: { gte: today } },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: { ...whereAll, paidAt: { gte: month } },
      _sum: { amount: true },
    }),
    prisma.invoice.groupBy({
      by: ["status"],
      where: whereAll,
      _count: { _all: true },
    }),
    prisma.installment.count({
      where: { status: "OVERDUE", plan: { ...(user.branchId ? { branchId: user.branchId } : {}) } },
    }),
    prisma.payment.findMany({
      where: { ...whereAll, paidAt: { gte: sixMonthsAgo } },
      select: { paidAt: true, amount: true },
    }),
    prisma.invoiceItem.groupBy({
      by: ["description"],
      where: { invoice: { ...whereAll, status: { not: "CANCELLED" } } },
      _sum: { quantity: true, total: true },
      orderBy: { _sum: { total: "desc" } },
      take: 6,
    }),
    prisma.payment.groupBy({
      by: ["patientId"],
      where: whereAll,
      _sum: { amount: true },
      orderBy: { _sum: { amount: "desc" } },
      take: 5,
    }),
    prisma.expense.groupBy({
      by: ["category"],
      where: { expenseDate: { gte: month }, ...(user.branchId ? { branchId: user.branchId } : {}) },
      _sum: { amount: true },
      orderBy: { _sum: { amount: "desc" } },
    }),
  ])

  const topPatientRows = await prisma.patient.findMany({
    where: { id: { in: topPatients.map((p) => p.patientId) } },
    select: { id: true, patientNo: true, firstName: true, middleName: true, lastName: true },
  })
  const patientMap = new Map(topPatientRows.map((p) => [p.id, p]))

  const band = (v: unknown) => Number(v ?? 0)

  const statusLabel: Record<string, string> = {
    DRAFT: ar ? "مسودة" : "Draft",
    ISSUED: ar ? "صادرة" : "Issued",
    PARTIALLY_PAID: ar ? "مدفوعة جزئيًا" : "Partially paid",
    PAID: ar ? "مدفوعة" : "Paid",
    CANCELLED: ar ? "ملغاة" : "Cancelled",
    REFUNDED: ar ? "مستردة" : "Refunded",
  }

  const trendMap = new Map<string, number>()
  for (const p of monthlyPayments) {
    const key = monthKey(p.paidAt)
    trendMap.set(key, (trendMap.get(key) ?? 0) + band(p.amount))
  }
  const trend: { label: string; value: number }[] = []
  for (let i = 0; i < 6; i++) {
    const d = new Date(sixMonthsAgo.getFullYear(), sixMonthsAgo.getMonth() + i, 1)
    const key = monthKey(d)
    const label =
      locale === "ar"
        ? d.toLocaleDateString("ar-YE", { month: "long", year: "2-digit" })
        : d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" })
    trend.push({ label, value: trendMap.get(key) ?? 0 })
  }
  const maxTrend = Math.max(1, ...trend.map((t) => t.value))

  const stats = [
    { label: ar ? "إيرادات اليوم" : "Revenue today", value: formatCurrency(revenueToday._sum.amount, "YER") },
    { label: ar ? "إيرادات الشهر" : "Revenue this month", value: formatCurrency(revenueMonth._sum.amount, "YER") },
    {
      label: ar ? "فواتير مدفوعة" : "Paid invoices",
      value: formatNumber(invoiceCounts.find((i) => i.status === "PAID")?._count._all ?? 0),
    },
    {
      label: ar ? "فواتير معلقة" : "Pending invoices",
      value: formatNumber(
        invoiceCounts
          .filter((i) => i.status === "ISSUED" || i.status === "PARTIALLY_PAID")
          .reduce((acc, i) => acc + i._count._all, 0)
      ),
    },
    { label: ar ? "أقساط متأخرة" : "Overdue installments", value: formatNumber(overdueInstallments), warn: overdueInstallments > 0 },
  ]

  const exportLinks = [
    { type: "procedures", label: ar ? "أفضل الإجراءات" : "Top procedures" },
    { type: "patients", label: ar ? "أعلى المرضى إنفاقًا" : "Top patients" },
    { type: "invoices", label: ar ? "الفواتير حسب الحالة" : "Invoices by status" },
    { type: "expenses", label: ar ? "المصروفات حسب الفئة" : "Expenses by category" },
  ]

  return (
    <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{ar ? "التقارير" : "Reports"}</h1>
          <p className="text-sm text-muted-foreground">{ar ? "ملخص الأداء المالي والتشغيلي" : "Financial and operational summary"}</p>
        </div>
        {user.permissions.includes("reports:export") && (
          <div className="flex flex-wrap gap-2">
            {exportLinks.map((l) => (
              <Button key={l.type} variant="outline" size="sm" asChild>
                <a href={`/api/reports/export?type=${l.type}`}>
                  <Download className="h-4 w-4" />
                  {l.label}
                </a>
              </Button>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">{s.label}</div>
              <div className={`mt-1 text-xl font-bold tabular-nums ${s.warn ? "text-destructive" : ""}`}>{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{ar ? "الاتجاه الشهري للإيرادات" : "Monthly revenue trend"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-48 items-end gap-2">
              {trend.map((t) => (
                <div key={t.label} className="flex flex-1 flex-col items-center gap-1">
                  <div className="w-full rounded-t-md bg-primary/20" style={{ height: `${Math.max(3, (t.value / maxTrend) * 150)}px` }} />
                  <div className="text-[10px] text-muted-foreground">{t.label}</div>
                  <div className="text-[10px] font-medium tabular-nums">{formatNumber(t.value)}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{ar ? "الفواتير حسب الحالة" : "Invoices by status"}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{ar ? "الحالة" : "Status"}</TableHead>
                  <TableHead className="text-end">{ar ? "العدد" : "Count"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoiceCounts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="py-8 text-center text-sm text-muted-foreground">
                      {ar ? "لا توجد بيانات" : "No data available"}
                    </TableCell>
                  </TableRow>
                ) : (
                  invoiceCounts.map((i) => (
                    <TableRow key={i.status}>
                      <TableCell>{statusLabel[i.status] ?? i.status}</TableCell>
                      <TableCell className="text-end tabular-nums">{formatNumber(i._count._all)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{ar ? "أكثر الإجراءات" : "Top procedures"}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{ar ? "الإجراء" : "Procedure"}</TableHead>
                  <TableHead className="text-end">{ar ? "العدد" : "Count"}</TableHead>
                  <TableHead className="text-end">{ar ? "المبلغ" : "Amount"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topProcedures.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                      {ar ? "لا توجد بيانات" : "No data available"}
                    </TableCell>
                  </TableRow>
                ) : (
                  topProcedures.map((p) => (
                    <TableRow key={p.description}>
                      <TableCell>{p.description}</TableCell>
                      <TableCell className="text-end tabular-nums">{formatNumber(p._sum.quantity ?? 0)}</TableCell>
                      <TableCell className="text-end tabular-nums">{formatCurrency(p._sum.total)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{ar ? "المصروفات حسب الفئة (الشهر)" : "Expenses by category (month)"}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{ar ? "الفئة" : "Category"}</TableHead>
                  <TableHead className="text-end">{ar ? "المبلغ" : "Amount"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expensesByCategory.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="py-8 text-center text-sm text-muted-foreground">
                      {ar ? "لا توجد بيانات" : "No data available"}
                    </TableCell>
                  </TableRow>
                ) : (
                  expensesByCategory.map((e) => (
                    <TableRow key={e.category}>
                      <TableCell>{expenseCategoryLabel(e.category, locale)}</TableCell>
                      <TableCell className="text-end tabular-nums">{formatCurrency(e._sum.amount)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">{ar ? "أعلى المرضى إنفاقًا" : "Top patients by spending"}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{ar ? "المريض" : "Patient"}</TableHead>
                <TableHead>{ar ? "الرقم" : "No."}</TableHead>
                <TableHead className="text-end">{ar ? "إجمالي المدفوعات" : "Total paid"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topPatients.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                    {ar ? "لا توجد بيانات" : "No data available"}
                  </TableCell>
                </TableRow>
              ) : (
                topPatients.map((p) => {
                  const patient = patientMap.get(p.patientId)
                  return (
                    <TableRow key={p.patientId}>
                      <TableCell>
                        {patient ? [patient.firstName, patient.middleName, patient.lastName].filter(Boolean).join(" ") : "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{patient?.patientNo ?? "—"}</TableCell>
                      <TableCell className="text-end tabular-nums">{formatCurrency(p._sum.amount)}</TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
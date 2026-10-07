import { requirePermission } from "@/lib/dal"
import { prisma } from "@/lib/prisma"
import { cookies } from "next/headers"
import Link from "next/link"
import { CalendarClock } from "lucide-react"
import { LANG_COOKIE, localeFrom, type Locale } from "@/lib/i18n"
import { formatCurrency, formatDate } from "@/lib/format"
import { InstallmentPlanDialog, type InstallmentInvoiceOption, type InstallmentPatientOption } from "@/components/installments/installment-plan-dialog"
import { Pagination } from "@/components/patients/pagination"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getI18n } from "@/lib/i18n-server"

type Params = { [key: string]: string | string[] | undefined }
type SearchParams = Promise<Params>

function sp(params: Params | undefined, key: string): string | undefined {
  const v = params?.[key]
  return typeof v === "string" ? v : undefined
}

const PER_PAGE = 12

export default async function InstallmentsPage({ searchParams }: { searchParams?: SearchParams }) {
  const user = await requirePermission("installments:view")
  const cookieStore = await cookies()
  const locale: Locale = localeFrom(cookieStore.get(LANG_COOKIE)?.value)
  const { t } = await getI18n()
  const ar = locale === "ar"
  const url: Params = (await searchParams) ?? {}

  const q = sp(url, "q")?.trim() ?? ""
  const page = Math.max(1, Number(sp(url, "page")) || 1)

  const where = {
    ...(user.branchId ? { branchId: user.branchId } : {}),
    ...(q
      ? {
          patient: {
            deletedAt: null,
            OR: [
              { firstName: { contains: q, mode: "insensitive" as const } },
              { lastName: { contains: q, mode: "insensitive" as const } },
              { patientNo: { contains: q, mode: "insensitive" as const } },
            ],
          },
        }
      : {}),
  }

  const [total, rows, patients, openInvoices] = await Promise.all([
    prisma.paymentPlan.count({ where }),
    prisma.paymentPlan.findMany({
      where,
      orderBy: { id: "asc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      include: {
        patient: { select: { id: true, patientNo: true, firstName: true, middleName: true, lastName: true } },
        installments: { select: { dueDate: true, status: true }, orderBy: { dueDate: "asc" } },
        _count: { select: { installments: true } },
      },
    }),
    prisma.patient.findMany({
      where: { deletedAt: null, ...(user.branchId ? { branchId: user.branchId } : {}) },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: { id: true, patientNo: true, firstName: true, middleName: true, lastName: true },
    }),
    prisma.invoice.findMany({
      where: {
        branchId: user.branchId ?? undefined,
        status: { in: ["ISSUED", "PARTIALLY_PAID"] },
        paymentPlan: { is: null },
      },
      orderBy: { createdAt: "desc" },
      take: 300,
      select: { id: true, invoiceNo: true, patientId: true, remaining: true },
    }),
  ])

  const patientOptions: InstallmentPatientOption[] = patients.map((p) => ({
    id: p.id,
    label: `${p.patientNo} · ${[p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ")}`,
  }))
  const invoiceOptions: InstallmentInvoiceOption[] = openInvoices
    .filter((i) => i.remaining.toNumber() > 0)
    .map((i) => ({ id: i.id, invoiceNo: i.invoiceNo, patientId: i.patientId, remaining: i.remaining.toNumber() }))

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))
  const preserved = new URLSearchParams()
  if (q) preserved.set("q", q)
  const preservedQuery = preserved.toString()

  return (
    <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t.nav.installments}</h1>
          <p className="text-sm text-muted-foreground">{t.page.totalPlans.replace("{count}", String(total))}</p>
        </div>
        {user.permissions.includes("installments:create") && (
          <InstallmentPlanDialog
            patients={patientOptions}
            invoices={invoiceOptions}
            trigger={
              <Button>
                <CalendarClock className="h-4 w-4" />
                {t.installments.newPlan}
              </Button>
            }
          />
        )}
      </div>

      <Card className="overflow-hidden">
        <form method="GET" action="/installments" className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <Input type="search" name="q" defaultValue={q} placeholder={t.page.searchPatient} className="w-full" />
          </div>
          <Button type="submit" variant="outline">{t.common.filter}</Button>
          {q && (
            <Button type="button" variant="ghost" asChild>
              <Link href="/installments">{t.common.clear}</Link>
            </Button>
          )}
        </form>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.patients.fullName}</TableHead>
                <TableHead className="text-end">{t.common.total}</TableHead>
                <TableHead className="text-end">{t.installments.downPayment}</TableHead>
                <TableHead className="text-end">{t.billing.paid}</TableHead>
                <TableHead className="text-end">{t.billing.remaining}</TableHead>
                <TableHead className="text-center">{t.installments.installments}</TableHead>
                <TableHead>{t.page.nextDue}</TableHead>
                <TableHead className="text-end">{t.common.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-16 text-center text-sm text-muted-foreground">{ar ? "لا توجد خطط تقسيط" : "No installment plans"}</TableCell>
                </TableRow>
              ) : (
                rows.map((plan) => {
                  const patientName = [plan.patient.firstName, plan.patient.middleName, plan.patient.lastName].filter(Boolean).join(" ")
                  const nextDue = plan.installments.find((i) => i.status !== "CANCELLED" && i.status !== "PAID")
                  return (
                    <TableRow key={plan.id}>
                      <TableCell>
                        <Link href={`/installments/${plan.id}`} className="font-medium hover:underline">{patientName}</Link>
                        <p className="text-xs text-muted-foreground">{plan.patient.patientNo}</p>
                      </TableCell>
                      <TableCell className="text-end tabular-nums">{formatCurrency(plan.totalAmount)}</TableCell>
                      <TableCell className="text-end tabular-nums">{formatCurrency(plan.downPayment)}</TableCell>
                      <TableCell className="text-end tabular-nums">{formatCurrency(plan.paidAmount)}</TableCell>
                      <TableCell className="text-end tabular-nums font-medium">{formatCurrency(plan.remainingAmount)}</TableCell>
                      <TableCell className="text-center tabular-nums">{plan._count.installments}</TableCell>
                      <TableCell className="whitespace-nowrap">{nextDue ? formatDate(nextDue.dueDate, locale) : "—"}</TableCell>
                      <TableCell className="text-end">
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/installments/${plan.id}`}>{t.common.view}</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

        <Pagination page={page} totalPages={totalPages} totalItems={total} perPage={PER_PAGE} basePath="/installments" preservedQuery={preservedQuery} />
      </Card>
    </div>
  )
}
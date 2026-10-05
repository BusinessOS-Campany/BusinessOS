import { requirePermission } from "@/lib/dal"
import { prisma } from "@/lib/prisma"
import { cookies } from "next/headers"
import { Banknote } from "lucide-react"
import { LANG_COOKIE, localeFrom, type Locale } from "@/lib/i18n"
import { formatCurrency, formatDateTime } from "@/lib/format"
import { PAYMENT_METHODS, paymentMethodLabel } from "@/lib/constants/billing"
import { PaymentFormDialog, type PaymentInvoiceOption, type PaymentPatientOption } from "@/components/payments/payment-form-dialog"
import { RefundPaymentButton } from "@/components/payments/refund-payment-button"
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
const isMethod = (v: string): v is (typeof PAYMENT_METHODS)[number] =>
  PAYMENT_METHODS.includes(v as (typeof PAYMENT_METHODS)[number])

export default async function PaymentsPage({ searchParams }: { searchParams?: SearchParams }) {
  const user = await requirePermission("payments:view")
  const cookieStore = await cookies()
  const locale: Locale = localeFrom(cookieStore.get(LANG_COOKIE)?.value)
  const ar = locale === "ar"
  const url: Params = (await searchParams) ?? {}

  const q = sp(url, "q")?.trim() ?? ""
  const method = sp(url, "method") ?? ""
  const page = Math.max(1, Number(sp(url, "page")) || 1)

  const where = {
    ...(user.branchId ? { branchId: user.branchId } : {}),
    ...(method && isMethod(method) ? { method: method as never } : {}),
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
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      orderBy: { paidAt: "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      include: {
        patient: { select: { id: true, patientNo: true, firstName: true, middleName: true, lastName: true } },
        invoice: { select: { id: true, invoiceNo: true } },
        receivedBy: { select: { name: true, nameAr: true } },
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
      },
      orderBy: { createdAt: "desc" },
      take: 300,
      select: { id: true, invoiceNo: true, patientId: true, remaining: true },
    }),
  ])

  const patientOptions: PaymentPatientOption[] = patients.map((p) => ({
    id: p.id,
    label: `${p.patientNo} · ${[p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ")}`,
  }))
  const invoiceOptions: PaymentInvoiceOption[] = openInvoices
    .filter((i) => i.remaining.toNumber() > 0)
    .map((i) => ({ id: i.id, invoiceNo: i.invoiceNo, patientId: i.patientId, remaining: i.remaining.toNumber() }))

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))
  const preserved = new URLSearchParams()
  if (q) preserved.set("q", q)
  if (method) preserved.set("method", method)
  const preservedQuery = preserved.toString()

  return (
    <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{ar ? "المدفوعات" : "Payments"}</h1>
          <p className="text-sm text-muted-foreground">{total} {ar ? "دفعة" : "payments"}</p>
        </div>
        {user.permissions.includes("payments:create") && (
          <PaymentFormDialog
            patients={patientOptions}
            invoices={invoiceOptions}
            trigger={
              <Button>
                <Banknote className="h-4 w-4" />
                {ar ? "تسجيل دفعة" : "Record Payment"}
              </Button>
            }
          />
        )}
      </div>

      <Card className="overflow-hidden">
        <form method="GET" action="/payments" className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <Input type="search" name="q" defaultValue={q} placeholder={ar ? "بحث باسم المريض…" : "Search patient…"} className="w-full" />
          </div>
          <select
            name="method"
            defaultValue={method}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">{ar ? "كل الطرق" : "All methods"}</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>{paymentMethodLabel(m, locale)}</option>
            ))}
          </select>
          <Button type="submit" variant="outline">{ar ? "تصفية" : "Filter"}</Button>
        </form>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{ar ? "التاريخ" : "Date"}</TableHead>
                <TableHead>{ar ? "المريض" : "Patient"}</TableHead>
                <TableHead>{ar ? "الفاتورة" : "Invoice"}</TableHead>
                <TableHead className="text-end">{ar ? "المبلغ" : "Amount"}</TableHead>
                <TableHead>{ar ? "الطريقة" : "Method"}</TableHead>
                <TableHead>{ar ? "المرجع" : "Reference"}</TableHead>
                <TableHead>{ar ? "استلمها" : "Received by"}</TableHead>
                {user.permissions.includes("payments:refund") && <TableHead className="text-end">{ar ? "إجراءات" : "Actions"}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-16 text-center text-sm text-muted-foreground">{ar ? "لا توجد مدفوعات" : "No payments found"}</TableCell>
                </TableRow>
              ) : (
                rows.map((p) => {
                  const patientName = [p.patient.firstName, p.patient.middleName, p.patient.lastName].filter(Boolean).join(" ")
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="whitespace-nowrap">{formatDateTime(p.paidAt, locale)}</TableCell>
                      <TableCell>
                        <span className="font-medium">{patientName}</span>
                        <p className="text-xs text-muted-foreground">{p.patient.patientNo}</p>
                      </TableCell>
                      <TableCell className="tabular-nums">{p.invoice?.invoiceNo ?? "—"}</TableCell>
                      <TableCell className="text-end tabular-nums">{formatCurrency(p.amount)}</TableCell>
                      <TableCell>{paymentMethodLabel(p.method, locale)}</TableCell>
                      <TableCell>{p.reference ?? "—"}</TableCell>
                      <TableCell>{p.receivedBy ? (ar && p.receivedBy.nameAr ? p.receivedBy.nameAr : p.receivedBy.name) : "—"}</TableCell>
                      {user.permissions.includes("payments:refund") && (
                        <TableCell className="text-end">
                          <RefundPaymentButton paymentId={p.id} />
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

        <Pagination page={page} totalPages={totalPages} totalItems={total} perPage={PER_PAGE} basePath="/payments" preservedQuery={preservedQuery} />
      </Card>
    </div>
  )
}
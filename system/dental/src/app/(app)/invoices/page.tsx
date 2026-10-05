import { requirePermission } from "@/lib/dal"
import { prisma } from "@/lib/prisma"
import { cookies } from "next/headers"
import Link from "next/link"
import { FilePlus2, Printer } from "lucide-react"
import { LANG_COOKIE, localeFrom, type Locale } from "@/lib/i18n"
import { statusColor } from "@/lib/status-ui"
import { formatCurrency, formatDate } from "@/lib/format"
import { INVOICE_STATUSES, invoiceStatusLabel } from "@/lib/constants/billing"
import { InvoiceFormDialog, type InvoicePatientOption, type InvoiceProcedureLight } from "@/components/invoices/invoice-form-dialog"
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

const PER_PAGE = 12
const isStatus = (v: string): v is (typeof INVOICE_STATUSES)[number] =>
  INVOICE_STATUSES.includes(v as (typeof INVOICE_STATUSES)[number])

export default async function InvoicesPage({ searchParams }: { searchParams?: SearchParams }) {
  const user = await requirePermission("invoices:view")
  const cookieStore = await cookies()
  const locale: Locale = localeFrom(cookieStore.get(LANG_COOKIE)?.value)
  const ar = locale === "ar"
  const url: Params = (await searchParams) ?? {}

  const q = sp(url, "q")?.trim() ?? ""
  const status = sp(url, "status") ?? ""
  const page = Math.max(1, Number(sp(url, "page")) || 1)

  const where = {
    ...(user.branchId ? { branchId: user.branchId } : {}),
    ...(status && isStatus(status) ? { status: status as never } : {}),
    ...(q
      ? {
          OR: [
            { invoiceNo: { contains: q, mode: "insensitive" as const } },
            {
              patient: {
                deletedAt: null,
                OR: [
                  { firstName: { contains: q, mode: "insensitive" as const } },
                  { lastName: { contains: q, mode: "insensitive" as const } },
                  { patientNo: { contains: q, mode: "insensitive" as const } },
                ],
              },
            },
          ],
        }
      : {}),
  }

  const [total, rows, patients, dentists, procedures] = await Promise.all([
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      include: {
        patient: { select: { id: true, patientNo: true, firstName: true, middleName: true, lastName: true } },
        _count: { select: { payments: true } },
      },
    }),
    prisma.patient.findMany({
      where: { deletedAt: null, ...(user.branchId ? { branchId: user.branchId } : {}) },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: { id: true, patientNo: true, firstName: true, middleName: true, lastName: true },
    }),
    prisma.dentist.findMany({
      where: { isActive: true },
      select: { id: true, user: { select: { name: true, nameAr: true } } },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.procedure.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { id: true, code: true, nameEn: true, nameAr: true, price: true },
    }),
  ])

  const patientOptions: InvoicePatientOption[] = patients.map((p) => ({
    id: p.id,
    label: `${p.patientNo} · ${[p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ")}`,
  }))
  const dentistOptions: InvoicePatientOption[] = dentists.map((d) => ({
    id: d.id,
    label: d.user.nameAr && ar ? d.user.nameAr : d.user.name,
  }))
  const procedureOptions: InvoiceProcedureLight[] = procedures.map((p) => ({
    id: p.id,
    code: p.code,
    nameEn: p.nameEn,
    nameAr: p.nameAr,
    price: String(p.price),
  }))

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))
  const preserved = new URLSearchParams()
  if (q) preserved.set("q", q)
  if (status) preserved.set("status", status)
  const preservedQuery = preserved.toString()

  return (
    <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{ar ? "الفواتير" : "Invoices"}</h1>
          <p className="text-sm text-muted-foreground">{total} {ar ? "فاتورة" : "invoices"}</p>
        </div>
        {user.permissions.includes("invoices:create") && (
          <InvoiceFormDialog
            patients={patientOptions}
            dentists={dentistOptions}
            procedures={procedureOptions}
            defaultDentistId={user.isDentist ? user.dentistId ?? undefined : undefined}
            trigger={
              <Button>
                <FilePlus2 className="h-4 w-4" />
                {ar ? "فاتورة جديدة" : "New Invoice"}
              </Button>
            }
          />
        )}
      </div>

      <Card className="overflow-hidden">
        <form method="GET" action="/invoices" className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <Input type="search" name="q" defaultValue={q} placeholder={ar ? "بحث برقم الفاتورة أو المريض…" : "Search invoice no or patient…"} className="w-full" />
          </div>
          <select
            name="status"
            defaultValue={status}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">{ar ? "كل الحالات" : "All statuses"}</option>
            {INVOICE_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <Button type="submit" variant="outline">{ar ? "تصفية" : "Filter"}</Button>
          {(q || status) && (
            <Button type="button" variant="ghost" asChild>
              <Link href="/invoices">{ar ? "مسح" : "Clear"}</Link>
            </Button>
          )}
        </form>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{ar ? "الرقم" : "Number"}</TableHead>
                <TableHead>{ar ? "المريض" : "Patient"}</TableHead>
                <TableHead>{ar ? "التاريخ" : "Date"}</TableHead>
                <TableHead className="text-end">{ar ? "الإجمالي" : "Total"}</TableHead>
                <TableHead className="text-end">{ar ? "المدفوع" : "Paid"}</TableHead>
                <TableHead className="text-end">{ar ? "المتبقي" : "Remaining"}</TableHead>
                <TableHead>{ar ? "الحالة" : "Status"}</TableHead>
                <TableHead className="text-end">{ar ? "إجراءات" : "Actions"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-16 text-center text-sm text-muted-foreground">{ar ? "لا توجد فواتير" : "No invoices found"}</TableCell>
                </TableRow>
              ) : (
                rows.map((inv) => {
                  const c = statusColor(inv.status)
                  const patientName = [inv.patient.firstName, inv.patient.middleName, inv.patient.lastName].filter(Boolean).join(" ")
                  return (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium tabular-nums">
                        <Link href={`/invoices/${inv.id}`} className="hover:underline">{inv.invoiceNo}</Link>
                        <p className="text-xs text-muted-foreground">{inv._count.payments} {ar ? "دفعة" : "payments"}</p>
                      </TableCell>
                      <TableCell>
                        <Link href={`/patients/${inv.patient.id}`} className="hover:underline">{patientName}</Link>
                        <p className="text-xs text-muted-foreground">{inv.patient.patientNo}</p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(inv.issueDate, locale)}</TableCell>
                      <TableCell className="text-end tabular-nums">{formatCurrency(inv.total)}</TableCell>
                      <TableCell className="text-end tabular-nums">{formatCurrency(inv.paid)}</TableCell>
                      <TableCell className="text-end tabular-nums">{formatCurrency(inv.remaining)}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs" style={{ borderColor: c.border, color: c.text, background: c.bg }}>
                          {invoiceStatusLabel(inv.status, locale)}
                        </span>
                      </TableCell>
                      <TableCell className="text-end">
                        <div className="flex justify-end gap-1.5">
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/invoices/${inv.id}`}>{ar ? "عرض" : "View"}</Link>
                          </Button>
                          <Button variant="outline" size="icon" className="h-8 w-8" asChild title={ar ? "طباعة" : "Print"}>
                            <Link href={`/print/invoices/${inv.id}`}>
                              <Printer className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

        <Pagination page={page} totalPages={totalPages} totalItems={total} perPage={PER_PAGE} basePath="/invoices" preservedQuery={preservedQuery} />
      </Card>
    </div>
  )
}
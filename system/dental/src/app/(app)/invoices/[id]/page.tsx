import { notFound } from "next/navigation"
import { requirePermission } from "@/lib/dal"
import { prisma } from "@/lib/prisma"
import { cookies } from "next/headers"
import Link from "next/link"
import { ArrowLeft, Printer } from "lucide-react"
import { LANG_COOKIE, localeFrom, type Locale } from "@/lib/i18n"
import { statusColor } from "@/lib/status-ui"
import { formatCurrency, formatDateTime, formatDate } from "@/lib/format"
import { invoiceStatusLabel, paymentMethodLabel } from "@/lib/constants/billing"
import { InvoiceStatusControls } from "@/components/invoices/invoice-status-controls"
import { PayInvoiceDialog } from "@/components/invoices/pay-invoice-dialog"
import { RefundPaymentButton } from "@/components/payments/refund-payment-button"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

interface Props {
  params: Promise<{ id: string }>
}

export default async function InvoiceDetailPage({ params }: Props) {
  const user = await requirePermission("invoices:view")
  const { id } = await params
  const cookieStore = await cookies()
  const locale: Locale = localeFrom(cookieStore.get(LANG_COOKIE)?.value)
  const ar = locale === "ar"

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      patient: { select: { id: true, patientNo: true, firstName: true, middleName: true, lastName: true } },
      dentist: { select: { id: true, name: true, nameAr: true } },
      items: {
        include: { procedure: { select: { code: true } } },
      },
      payments: {
        orderBy: { paidAt: "desc" },
        include: { receivedBy: { select: { name: true, nameAr: true } } },
      },
    },
  })
  if (!invoice) notFound()

  const patientName = [invoice.patient.firstName, invoice.patient.middleName, invoice.patient.lastName].filter(Boolean).join(" ")
  const c = statusColor(invoice.status)
  const canPay = user.permissions.includes("payments:create") && invoice.remaining.toNumber() > 0 && invoice.status !== "CANCELLED" && invoice.status !== "REFUNDED"

  return (
    <div className="mx-auto w-full max-w-5xl p-4 sm:p-6 lg:p-8">
      <div className="mb-4 flex items-center justify-between gap-2">
        <Button variant="ghost" asChild>
          <Link href="/invoices">
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
            {ar ? "العودة للفواتير" : "Back to invoices"}
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/print/invoices/${invoice.id}`}>
            <Printer className="h-3.5 w-3.5" />
            {ar ? "طباعة" : "Print"}
          </Link>
        </Button>
      </div>

      <div className="grid gap-4">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="text-xl tabular-nums">{invoice.invoiceNo}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{formatDateTime(invoice.issueDate, locale)}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className="inline-flex items-center rounded-full border px-3 py-1 text-sm" style={{ borderColor: c.border, color: c.text, background: c.bg }}>
                {invoiceStatusLabel(invoice.status, locale)}
              </span>
              <InvoiceStatusControls
                invoiceId={invoice.id}
                status={invoice.status}
                canEdit={user.permissions.includes("invoices:edit")}
                canRefund={user.permissions.includes("invoices:refund")}
                canDelete={user.permissions.includes("invoices:delete")}
              />
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">{ar ? "المريض" : "Patient"}</p>
              <Link href={`/patients/${invoice.patient.id}`} className="font-medium hover:underline">{patientName}</Link>
              <p className="text-xs text-muted-foreground">{invoice.patient.patientNo}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{ar ? "الطبيب" : "Dentist"}</p>
              <p className="font-medium">{invoice.dentist ? (ar && invoice.dentist.nameAr ? invoice.dentist.nameAr : invoice.dentist.name) : "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{ar ? "تاريخ الاستحقاق" : "Due date"}</p>
              <p className="font-medium">{invoice.dueDate ? formatDate(invoice.dueDate, locale) : "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{ar ? "ملاحظات" : "Notes"}</p>
              <p className="font-medium">{invoice.notes || "—"}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{ar ? "البنود" : "Items"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{ar ? "الوصف" : "Description"}</TableHead>
                    <TableHead>{ar ? "السن" : "Tooth"}</TableHead>
                    <TableHead className="text-center">{ar ? "الكمية" : "Qty"}</TableHead>
                    <TableHead className="text-end">{ar ? "سعر الوحدة" : "Unit price"}</TableHead>
                    <TableHead className="text-end">{ar ? "الخصم" : "Discount"}</TableHead>
                    <TableHead className="text-end">{ar ? "الإجمالي" : "Total"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoice.items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">{ar ? "لا توجد بنود" : "No items"}</TableCell>
                    </TableRow>
                  ) : (
                    invoice.items.map((it) => (
                      <TableRow key={it.id}>
                        <TableCell>
                          <p className="font-medium">{it.description}</p>
                          {it.procedure && <p className="text-xs text-muted-foreground">{it.procedure.code}</p>}
                        </TableCell>
                        <TableCell>{it.toothNumber ?? "—"}</TableCell>
                        <TableCell className="text-center tabular-nums">{it.quantity}</TableCell>
                        <TableCell className="text-end tabular-nums">{formatCurrency(it.unitPrice)}</TableCell>
                        <TableCell className="text-end tabular-nums">{formatCurrency(it.discount)}</TableCell>
                        <TableCell className="text-end tabular-nums">{formatCurrency(it.total)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <Separator className="my-4" />
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{ar ? "المجموع الفرعي" : "Subtotal"}</span>
                <span className="tabular-nums">{formatCurrency(invoice.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{ar ? "الخصم" : "Discount"}</span>
                <span className="tabular-nums">{formatCurrency(invoice.discount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{ar ? "الضريبة" : "Tax"}</span>
                <span className="tabular-nums">{formatCurrency(invoice.tax)}</span>
              </div>
              <div className="flex justify-between text-base font-semibold">
                <span>{ar ? "الإجمالي" : "Total"}</span>
                <span className="tabular-nums">{formatCurrency(invoice.total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{ar ? "المدفوع" : "Paid"}</span>
                <span className="tabular-nums">{formatCurrency(invoice.paid)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{ar ? "المتبقي" : "Remaining"}</span>
                <span className="tabular-nums font-medium">{formatCurrency(invoice.remaining)}</span>
              </div>
            </div>

            {canPay && (
              <>
                <Separator className="my-4" />
                <div className="flex justify-end">
                  <PayInvoiceDialog
                    patientId={invoice.patient.id}
                    patientNo={invoice.patient.patientNo}
                    invoiceId={invoice.id}
                    remaining={invoice.remaining.toNumber()}
                    trigger={<Button>{ar ? "تسجيل دفعة" : "Record Payment"}</Button>}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{ar ? "المدفوعات" : "Payments"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{ar ? "التاريخ" : "Date"}</TableHead>
                    <TableHead className="text-end">{ar ? "المبلغ" : "Amount"}</TableHead>
                    <TableHead>{ar ? "الطريقة" : "Method"}</TableHead>
                    <TableHead>{ar ? "المرجع" : "Reference"}</TableHead>
                    <TableHead>{ar ? "استلمها" : "Received by"}</TableHead>
                    {user.permissions.includes("payments:refund") && <TableHead className="text-end">{ar ? "إجراءات" : "Actions"}</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoice.payments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">{ar ? "لا توجد مدفوعات" : "No payments yet"}</TableCell>
                    </TableRow>
                  ) : (
                    invoice.payments.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="whitespace-nowrap">{formatDateTime(p.paidAt, locale)}</TableCell>
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
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
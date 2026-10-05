import { notFound } from "next/navigation"
import { requirePermission } from "@/lib/dal"
import { prisma } from "@/lib/prisma"
import { cookies } from "next/headers"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { LANG_COOKIE, localeFrom, type Locale } from "@/lib/i18n"
import { statusColor } from "@/lib/status-ui"
import { formatCurrency, formatDate } from "@/lib/format"
import { installmentStatusLabel } from "@/lib/constants/billing"
import { InstallmentRowActions, type InstallmentLite } from "@/components/installments/installment-actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

interface Props {
  params: Promise<{ id: string }>
}

export default async function InstallmentPlanDetailPage({ params }: Props) {
  const user = await requirePermission("installments:view")
  const { id } = await params
  const cookieStore = await cookies()
  const locale: Locale = localeFrom(cookieStore.get(LANG_COOKIE)?.value)
  const ar = locale === "ar"

  const plan = await prisma.paymentPlan.findUnique({
    where: { id },
    include: {
      patient: { select: { id: true, patientNo: true, firstName: true, middleName: true, lastName: true } },
      invoice: { select: { id: true, invoiceNo: true } },
      installments: {
        orderBy: { dueDate: "asc" },
        include: { receivedBy: { select: { name: true, nameAr: true } } },
      },
    },
  })
  if (!plan) notFound()

  const patientName = [plan.patient.firstName, plan.patient.middleName, plan.patient.lastName].filter(Boolean).join(" ")
  const canEdit = user.permissions.includes("installments:edit")

  return (
    <div className="mx-auto w-full max-w-5xl p-4 sm:p-6 lg:p-8">
      <div className="mb-4">
        <Button variant="ghost" asChild>
          <Link href="/installments">
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
            {ar ? "العودة لخطط التقسيط" : "Back to installment plans"}
          </Link>
        </Button>
      </div>

      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{ar ? "خطة السداد" : "Payment Plan"}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">{ar ? "المريض" : "Patient"}</p>
              <Link href={`/patients/${plan.patient.id}`} className="font-medium hover:underline">{patientName}</Link>
              <p className="text-xs text-muted-foreground">{plan.patient.patientNo}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{ar ? "الفاتورة" : "Invoice"}</p>
              {plan.invoice ? (
                <Link href={`/invoices/${plan.invoice.id}`} className="font-medium tabular-nums hover:underline">{plan.invoice.invoiceNo}</Link>
              ) : (
                <p className="font-medium">—</p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{ar ? "الإجمالي" : "Total"}</p>
              <p className="font-medium tabular-nums">{formatCurrency(plan.totalAmount)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{ar ? "الدفعة الأولى" : "Down payment"}</p>
              <p className="font-medium tabular-nums">{formatCurrency(plan.downPayment)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{ar ? "المدفوع" : "Paid"}</p>
              <p className="font-medium tabular-nums">{formatCurrency(plan.paidAmount)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{ar ? "المتبقي" : "Remaining"}</p>
              <p className="font-medium tabular-nums">{formatCurrency(plan.remainingAmount)}</p>
            </div>
            {plan.notes && (
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground">{ar ? "ملاحظات" : "Notes"}</p>
                <p className="font-medium">{plan.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{ar ? "الأقساط" : "Installments"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{ar ? "الاستحقاق" : "Due date"}</TableHead>
                    <TableHead className="text-end">{ar ? "المبلغ" : "Amount"}</TableHead>
                    <TableHead className="text-end">{ar ? "المدفوع" : "Paid"}</TableHead>
                    <TableHead className="text-end">{ar ? "المتبقي" : "Remaining"}</TableHead>
                    <TableHead>{ar ? "الحالة" : "Status"}</TableHead>
                    <TableHead>{ar ? "سددها" : "Received by"}</TableHead>
                    {canEdit && <TableHead className="text-end">{ar ? "إجراءات" : "Actions"}</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plan.installments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">{ar ? "لا توجد أقساط في هذه الخطة" : "No installments in this plan"}</TableCell>
                    </TableRow>
                  ) : (
                    plan.installments.map((inst) => {
                      const c = statusColor(inst.status)
                      const remainingInst = inst.amount.toNumber() - inst.paidAmount.toNumber()
                      const lite: InstallmentLite = {
                        id: inst.id,
                        amount: String(inst.amount),
                        paidAmount: String(inst.paidAmount),
                        status: inst.status,
                      }
                      return (
                        <TableRow key={inst.id}>
                          <TableCell className="whitespace-nowrap">{formatDate(inst.dueDate, locale)}</TableCell>
                          <TableCell className="text-end tabular-nums">{formatCurrency(inst.amount)}</TableCell>
                          <TableCell className="text-end tabular-nums">{formatCurrency(inst.paidAmount)}</TableCell>
                          <TableCell className="text-end tabular-nums">{formatCurrency(Math.max(0, remainingInst))}</TableCell>
                          <TableCell>
                            <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs" style={{ borderColor: c.border, color: c.text, background: c.bg }}>
                              {installmentStatusLabel(inst.status, locale)}
                            </span>
                          </TableCell>
                          <TableCell>
                            {inst.receivedBy ? (ar && inst.receivedBy.nameAr ? inst.receivedBy.nameAr : inst.receivedBy.name) : "—"}
                            {inst.paidAt ? <p className="text-xs text-muted-foreground">{formatDate(inst.paidAt, locale)}</p> : null}
                          </TableCell>
                          {canEdit && (
                            <TableCell className="text-end">
                              <InstallmentRowActions installment={lite} />
                            </TableCell>
                          )}
                        </TableRow>
                      )
                    })
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
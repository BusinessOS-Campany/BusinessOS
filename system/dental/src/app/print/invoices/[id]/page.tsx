import { notFound } from "next/navigation"
import { requirePermission } from "@/lib/dal"
import { prisma } from "@/lib/prisma"
import { cookies } from "next/headers"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { LANG_COOKIE, localeFrom, type Locale } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { PrintButton } from "@/components/prescriptions/print-button"
import { calcAge, formatCurrency, formatDate } from "@/lib/format"
import { invoiceStatusLabel, paymentMethodLabel } from "@/lib/constants/billing"
import { getI18n } from "@/lib/i18n-server"

interface Props {
  params: Promise<{ id: string }>
}

export default async function InvoicePrintPage({ params }: Props) {
  const user = await requirePermission("invoices:view")
  const { id } = await params
  const cookieStore = await cookies()
  const locale: Locale = localeFrom(cookieStore.get(LANG_COOKIE)?.value)
  const { t } = await getI18n()

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      patient: {
        select: {
          patientNo: true,
          firstName: true,
          middleName: true,
          lastName: true,
          gender: true,
          dateOfBirth: true,
          phone: true,
          city: true,
        },
      },
      dentist: { select: { name: true, nameAr: true } },
      items: true,
      payments: { orderBy: { paidAt: "asc" }, include: { receivedBy: { select: { name: true, nameAr: true } } } },
    },
  })
  if (!invoice) notFound()

  const clinic = user.clinicId
    ? await prisma.clinic.findUnique({ where: { id: user.clinicId }, select: { name: true, nameAr: true, address: true, city: true, phone: true } })
    : null
  const clinicName = locale === "ar" ? (clinic?.nameAr ?? clinic?.name ?? "") : (clinic?.name ?? "")
  const age = calcAge(invoice.patient.dateOfBirth)
  const patientName = [invoice.patient.firstName, invoice.patient.middleName, invoice.patient.lastName].filter(Boolean).join(" ")
  const dentistName = invoice.dentist ? (locale === "ar" && invoice.dentist.nameAr ? invoice.dentist.nameAr : invoice.dentist.name) : ""

  return (
    <div className="mx-auto min-h-screen w-full max-w-3xl p-4 sm:p-8">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Button variant="ghost" asChild>
          <Link href="/invoices">
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
            {t.common.back}
          </Link>
        </Button>
        <PrintButton label={t.common.print} />
      </div>

      <div className="rounded-xl border bg-background p-6 text-foreground sm:p-8">
        <header className="flex flex-col items-center gap-1 border-b pb-4 text-center">
          {clinicName && <h1 className="text-xl font-bold">{clinicName}</h1>}
          <p className="text-xs text-muted-foreground">
            {[clinic?.address, clinic?.city].filter(Boolean).join(" · ")}
            {clinic?.phone ? ` · ${clinic.phone}` : ""}
          </p>
          <p className="mt-2 text-lg font-semibold tabular-nums">{invoice.invoiceNo}</p>
          <h2 className="text-sm uppercase tracking-wide text-muted-foreground">
            {t.billing.invoice} · {invoiceStatusLabel(invoice.status, locale)}
          </h2>
        </header>

        <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">{t.billing.patient}</p>
            <p className="font-semibold">{patientName}</p>
            <p className="text-muted-foreground">
              {invoice.patient.patientNo}
              {age !== null ? ` · ${t.print.age} ${age}` : ""}
            </p>
            <p className="text-muted-foreground">{invoice.patient.phone ?? ""}</p>
          </div>
          <div className="sm:text-end">
            <p className="text-xs text-muted-foreground">{t.billing.invoiceDate}</p>
            <p className="font-semibold">{formatDate(invoice.issueDate, locale)}</p>
            {invoice.dueDate && (
              <>
                <p className="mt-1 text-xs text-muted-foreground">{t.billing.dueDate}</p>
                <p className="font-medium">{formatDate(invoice.dueDate, locale)}</p>
              </>
            )}
            {dentistName && (
              <>
                <p className="mt-1 text-xs text-muted-foreground">{t.billing.dentist}</p>
                <p className="font-medium">{dentistName}</p>
              </>
            )}
          </div>
        </div>

        <Separator className="my-5" />

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs uppercase text-muted-foreground">
              <th className="py-2 text-start font-medium">#</th>
              <th className="py-2 text-start font-medium">{t.billing.description}</th>
              <th className="py-2 text-start font-medium">{t.billing.tooth}</th>
              <th className="py-2 text-center font-medium">{t.billing.quantity}</th>
              <th className="py-2 text-end font-medium">{t.billing.unitPrice}</th>
              <th className="py-2 text-end font-medium">{t.billing.total}</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item, i) => (
              <tr key={item.id} className="border-b">
                <td className="py-2 tabular-nums">{i + 1}</td>
                <td className="py-2 font-medium">{item.description}</td>
                <td className="py-2">{item.toothNumber ?? "—"}</td>
                <td className="py-2 text-center tabular-nums">{item.quantity}</td>
                <td className="py-2 text-end tabular-nums">{formatCurrency(item.unitPrice)}</td>
                <td className="py-2 text-end tabular-nums">{formatCurrency(item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 ml-auto w-full max-w-xs space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t.billing.subtotal}</span>
            <span className="tabular-nums">{formatCurrency(invoice.subtotal)}</span>
          </div>
          {invoice.discount.toNumber() > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t.billing.discount}</span>
              <span className="tabular-nums">{formatCurrency(invoice.discount)}</span>
            </div>
          )}
          {invoice.tax.toNumber() > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t.billing.tax}</span>
              <span className="tabular-nums">{formatCurrency(invoice.tax)}</span>
            </div>
          )}
          <div className="flex justify-between border-t pt-1 text-base font-semibold">
            <span>{t.billing.total}</span>
            <span className="tabular-nums">{formatCurrency(invoice.total)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t.billing.paid}</span>
            <span className="tabular-nums">{formatCurrency(invoice.paid)}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-medium">{t.billing.remaining}</span>
            <span className="tabular-nums font-semibold">{formatCurrency(invoice.remaining)}</span>
          </div>
        </div>

        {invoice.notes && (
          <p className="mt-4 text-sm">
            <span className="font-medium">{t.billing.notes}:</span>
            {invoice.notes}
          </p>
        )}

        {invoice.payments.length > 0 && (
          <>
            <Separator className="my-5" />
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs uppercase text-muted-foreground">
                  <th className="py-2 text-start font-medium">{t.payments.paidAt}</th>
                  <th className="py-2 text-start font-medium">{t.billing.method}</th>
                  <th className="py-2 text-start font-medium">{t.billing.reference}</th>
                  <th className="py-2 text-end font-medium">{t.payments.amount}</th>
                </tr>
              </thead>
              <tbody>
                {invoice.payments.map((p) => (
                  <tr key={p.id} className="border-b">
                    <td className="py-2">{formatDate(p.paidAt, locale)}</td>
                    <td className="py-2">{paymentMethodLabel(p.method, locale)}</td>
                    <td className="py-2">{p.reference ?? "—"}</td>
                    <td className="py-2 text-end tabular-nums">{formatCurrency(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <div className="mt-10 grid grid-cols-2 gap-8 text-sm">
          <div className="h-16 border-t pt-1 text-center text-xs text-muted-foreground">
            {t.print.doctorSignature}
          </div>
          <div className="h-16 border-t pt-1 text-center text-xs text-muted-foreground">
            {t.print.clinicStamp}
          </div>
        </div>
      </div>
    </div>
  )
}
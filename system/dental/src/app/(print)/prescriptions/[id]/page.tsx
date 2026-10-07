import { notFound } from "next/navigation"
import { requirePermission } from "@/lib/dal"
import { prisma } from "@/lib/prisma"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getI18n } from "@/lib/i18n-server"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { PrintButton } from "@/components/prescriptions/print-button"
import { calcAge, formatDate } from "@/lib/format"

interface Props {
  params: Promise<{ id: string }>
}

export default async function PrescriptionPrintPage({ params }: Props) {
  const user = await requirePermission("prescriptions:view")
  const { id } = await params
  const { t, locale } = await getI18n()

  const rx = await prisma.prescription.findUnique({
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
      dentist: { select: { user: { select: { name: true, nameAr: true } } } },
      items: { orderBy: { medicationName: "asc" } },
    },
  })
  if (!rx) notFound()

  const clinic = user.clinicId
    ? await prisma.clinic.findUnique({ where: { id: user.clinicId }, select: { name: true, nameAr: true, address: true, city: true, phone: true } })
    : null
  const clinicName = locale === "ar" ? (clinic?.nameAr ?? clinic?.name ?? "") : (clinic?.name ?? "")
  const age = calcAge(rx.patient.dateOfBirth)
  const patientName = [rx.patient.firstName, rx.patient.middleName, rx.patient.lastName].filter(Boolean).join(" ")
  const doctorName =
    rx.dentist?.user.nameAr && locale === "ar" ? (rx.dentist.user.nameAr ?? rx.dentist.user.name) : rx.dentist?.user.name ?? ""

  return (
    <div className="mx-auto min-h-screen w-full max-w-3xl p-4 sm:p-8">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Button variant="ghost" asChild>
          <Link href="/prescriptions">
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
            {t.prescriptions.back}
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
          <h2 className="mt-2 text-lg font-semibold underline underline-offset-4">
            {t.prescriptions.title}
          </h2>
        </header>

        <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">{t.prescriptions.patient}</p>
            <p className="font-semibold">{patientName}</p>
            <p className="text-muted-foreground">
              {rx.patient.patientNo}
              {age !== null ? ` · ${t.patients.age} ${age}` : ""}
            </p>
            <p className="text-muted-foreground">{rx.patient.phone ?? ""}</p>
          </div>
          <div className="sm:text-end">
            <p className="text-xs text-muted-foreground">{t.prescriptions.date}</p>
            <p className="font-semibold">{formatDate(rx.date, locale)}</p>
            {doctorName && (
              <>
                <p className="mt-1 text-xs text-muted-foreground">{t.prescriptions.dentist}</p>
                <p className="font-medium">{doctorName}</p>
              </>
            )}
          </div>
        </div>

        <Separator className="my-5" />

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs uppercase text-muted-foreground">
              <th className="py-2 text-start font-medium">#</th>
              <th className="py-2 text-start font-medium">{t.page.medication}</th>
              <th className="py-2 text-start font-medium">{t.page.dose}</th>
              <th className="py-2 text-start font-medium">{t.page.frequency}</th>
              <th className="py-2 text-start font-medium">{t.page.duration}</th>
              <th className="py-2 text-start font-medium">{t.page.route}</th>
              <th className="py-2 text-end font-medium">{t.common.quantity}</th>
            </tr>
          </thead>
          <tbody>
            {rx.items.map((item, i) => (
              <tr key={item.id} className="border-b">
                <td className="py-2 tabular-nums">{i + 1}</td>
                <td className="py-2 font-medium">{item.medicationName}</td>
                <td className="py-2">{item.dose ?? "—"}</td>
                <td className="py-2">{item.frequency ?? "—"}</td>
                <td className="py-2">{item.duration ?? "—"}</td>
                <td className="py-2">{item.route ?? "—"}</td>
                <td className="py-2 text-end">{item.quantity ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {rx.items.some((i) => i.instructions) && (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b text-xs uppercase text-muted-foreground">
                <th className="py-2 text-start font-medium">{t.page.medication}</th>
                <th className="py-2 text-start font-medium">{t.page.instructions}</th>
              </tr>
            </thead>
            <tbody>
              {rx.items
                .filter((i) => i.instructions)
                .map((item) => (
                  <tr key={item.id} className="border-b">
                    <td className="py-2 font-medium">{item.medicationName}</td>
                    <td className="py-2">{item.instructions}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}

        {(rx.instructions || rx.notes) && (
          <div className="mt-5 space-y-2 text-sm">
            {rx.instructions && (
              <p>
                <span className="font-medium">{t.page.generalInstructions}: </span>
                {rx.instructions}
              </p>
            )}
            {rx.notes && (
              <p>
                <span className="font-medium">{t.page.notesColon}</span>
                {rx.notes}
              </p>
            )}
          </div>
        )}

        <div className="mt-10 grid grid-cols-2 gap-8 text-sm">
          <div className="h-16 border-t pt-1 text-center text-xs text-muted-foreground">
            {t.page.doctorSignature}
          </div>
          <div className="h-16 border-t pt-1 text-center text-xs text-muted-foreground">
            {t.page.clinicStamp}
          </div>
        </div>
      </div>
    </div>
  )
}
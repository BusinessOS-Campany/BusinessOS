import { requirePermission } from "@/lib/dal"
import { prisma } from "@/lib/prisma"
import { cookies } from "next/headers"
import Link from "next/link"
import { FilePlus2, Printer } from "lucide-react"
import { LANG_COOKIE, dictionary, localeFrom, type Locale } from "@/lib/i18n"
import { PrescriptionFormDialog, type PrescriptionOptions } from "@/components/prescriptions/prescription-form-dialog"
import { Pagination } from "@/components/patients/pagination"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatDate } from "@/lib/format"

type Params = { [key: string]: string | string[] | undefined }
type SearchParams = Promise<Params>

function sp(params: Params | undefined, key: string): string | undefined {
  const v = params?.[key]
  return typeof v === "string" ? v : undefined
}

const PER_PAGE = 10

export default async function PrescriptionsPage({ searchParams }: { searchParams?: SearchParams }) {
  const user = await requirePermission("prescriptions:view")
  const cookieStore = await cookies()
  const locale: Locale = localeFrom(cookieStore.get(LANG_COOKIE)?.value)
  const t = dictionary[locale]
  const url: Params = (await searchParams) ?? {}

  const q = sp(url, "q")?.trim() ?? ""
  const from = sp(url, "from") ?? ""
  const to = sp(url, "to") ?? ""
  const page = Math.max(1, Number(sp(url, "page")) || 1)

  const where = {
    ...(q
      ? {
          patient: {
            deletedAt: null,
            OR: [
              { firstName: { contains: q, mode: "insensitive" as const } },
              { lastName: { contains: q, mode: "insensitive" as const } },
              { patientNo: { contains: q, mode: "insensitive" as const } },
              { phone: { contains: q, mode: "insensitive" as const } },
            ],
          },
        }
      : {}),
    ...(from ? { date: { gte: new Date(`${from}T00:00:00Z`) } } : {}),
    ...(to ? { date: { lt: new Date(`${new Date(`${to}T00:00:00Z`).getTime() + 86400000}`) } } : {}),
  }

  const [total, rows] = await Promise.all([
    prisma.prescription.count({ where }),
    prisma.prescription.findMany({
      where,
      orderBy: { date: "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      include: {
        patient: { select: { id: true, patientNo: true, firstName: true, middleName: true, lastName: true } },
        dentist: { select: { user: { select: { name: true, nameAr: true } } } },
        items: { select: { medicationName: true }, orderBy: { medicationName: "asc" } },
      },
    }),
  ])

  const [patients, dentists] = await Promise.all([
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
  ])

  const options: PrescriptionOptions = {
    patients: patients.map((p) => ({
      id: p.id,
      label: `${p.patientNo} · ${[p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ")}`,
    })),
    dentists: dentists.map((d) => ({
      id: d.id,
      label: d.user.nameAr ? `${d.user.name} · ${d.user.nameAr}` : d.user.name,
    })),
  }

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))
  const preserved = new URLSearchParams()
  if (q) preserved.set("q", q)
  if (from) preserved.set("from", from)
  if (to) preserved.set("to", to)
  const preservedQuery = preserved.toString()

  return (
    <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t.prescriptions.title}</h1>
          <p className="text-sm text-muted-foreground">{total} records</p>
        </div>
        {user.permissions.includes("prescriptions:create") && (
          <PrescriptionFormDialog
            options={options}
            defaultDentistId={user.isDentist ? user.dentistId ?? undefined : undefined}
            trigger={
              <Button>
                <FilePlus2 className="h-4 w-4" />
                {t.prescriptions.newPrescription}
              </Button>
            }
          />
        )}
      </div>

      <Card className="overflow-hidden">
        <form method="GET" action="/prescriptions" className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Input type="search" name="q" defaultValue={q} placeholder={t.common.search} className="w-full" />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Input type="date" name="from" defaultValue={from} aria-label="from" className="sm:w-40" />
            <Input type="date" name="to" defaultValue={to} aria-label="to" className="sm:w-40" />
            <Button type="submit" variant="outline">
              {t.common.filter}
            </Button>
            {(q || from || to) && (
              <Button type="button" variant="ghost" asChild>
                <Link href="/prescriptions">{t.common.clear}</Link>
              </Button>
            )}
          </div>
        </form>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.prescriptions.date}</TableHead>
                <TableHead>{t.prescriptions.patient}</TableHead>
                <TableHead>{t.prescriptions.dentist}</TableHead>
                <TableHead>{t.prescriptions.items}</TableHead>
                <TableHead className="text-end">{t.common.actions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-16 text-center text-sm text-muted-foreground">
                    {t.common.noData}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((rx) => {
                  const patientName = [rx.patient.firstName, rx.patient.middleName, rx.patient.lastName]
                    .filter(Boolean)
                    .join(" ")
                  const first = rx.items[0]?.medicationName
                  const dentistLabel =
                    rx.dentist?.user.nameAr && locale === "ar"
                      ? (rx.dentist.user.nameAr ?? rx.dentist.user.name)
                      : rx.dentist?.user.name ?? "—"
                  return (
                    <TableRow key={rx.id}>
                      <TableCell className="whitespace-nowrap tabular-nums">{formatDate(rx.date, locale)}</TableCell>
                      <TableCell>
                        <Link href={`/patients/${rx.patient.id}`} className="font-medium hover:underline">
                          {patientName}
                        </Link>
                        <p className="text-xs text-muted-foreground">{rx.patient.patientNo}</p>
                      </TableCell>
                      <TableCell>{dentistLabel}</TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {first ?? "—"}
                          {rx.items.length > 1 ? ` +${rx.items.length - 1}` : ""}
                        </span>
                      </TableCell>
                      <TableCell className="text-end">
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/prescriptions/${rx.id}`}>
                            {user.permissions.includes("prescriptions:print") ? (
                              <Printer className="h-3.5 w-3.5" />
                            ) : null}
                            {t.prescriptions.view}
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

        <Pagination
          page={page}
          totalPages={totalPages}
          totalItems={total}
          perPage={PER_PAGE}
          basePath="/prescriptions"
          preservedQuery={preservedQuery}
        />
      </Card>
    </div>
  )
}
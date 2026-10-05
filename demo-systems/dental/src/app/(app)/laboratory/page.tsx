import { requirePermission } from "@/lib/dal"
import { prisma } from "@/lib/prisma"
import { cookies } from "next/headers"
import Link from "next/link"
import { FlaskConical } from "lucide-react"
import { LANG_COOKIE, localeFrom, type Locale } from "@/lib/i18n"
import { statusColor } from "@/lib/status-ui"
import { formatCurrency, formatDate } from "@/lib/format"
import { LAB_CASE_STATUSES, labStatusLabel } from "@/lib/constants/inventory"
import { LabCaseFormDialog, type LabCaseLite, type LabPatientOption } from "@/components/laboratory/lab-case-form-dialog"
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
const isStatus = (v: string): v is (typeof LAB_CASE_STATUSES)[number] =>
  LAB_CASE_STATUSES.includes(v as (typeof LAB_CASE_STATUSES)[number])

export default async function LaboratoryPage({ searchParams }: { searchParams?: SearchParams }) {
  const user = await requirePermission("laboratory:view")
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

  const [total, rows, patients, dentists] = await Promise.all([
    prisma.labCase.count({ where }),
    prisma.labCase.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      include: {
        patient: { select: { id: true, patientNo: true, firstName: true, middleName: true, lastName: true } },
        dentist: { select: { user: { select: { name: true, nameAr: true } } } },
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
  ])

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))
  const preserved = new URLSearchParams()
  if (q) preserved.set("q", q)
  if (status) preserved.set("status", status)
  const preservedQuery = preserved.toString()

  const patientOptions: LabPatientOption[] = patients.map((p) => ({
    id: p.id,
    label: `${p.patientNo} · ${[p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ")}`,
  }))
  const dentistOptions: LabPatientOption[] = dentists.map((d) => ({
    id: d.id,
    label: ar && d.user.nameAr ? (d.user.nameAr as string) : d.user.name,
  }))

  return (
    <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{ar ? "المختبر" : "Laboratory"}</h1>
          <p className="text-sm text-muted-foreground">{total} {ar ? "حالة" : "lab cases"}</p>
        </div>
        {user.permissions.includes("laboratory:create") && (
          <LabCaseFormDialog
            trigger={
              <Button>
                <FlaskConical className="h-4 w-4" />
                {ar ? "حالة جديدة" : "New Lab Case"}
              </Button>
            }
            patients={patientOptions}
            dentists={dentistOptions}
          />
        )}
      </div>

      <Card className="overflow-hidden">
        <form method="GET" action="/laboratory" className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <Input type="search" name="q" defaultValue={q} placeholder={ar ? "بحث بالمريض…" : "Search patient…"} className="w-full" />
          </div>
          <select
            name="status"
            defaultValue={status}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">{ar ? "كل الحالات" : "All statuses"}</option>
            {LAB_CASE_STATUSES.map((s) => (
              <option key={s} value={s}>{labStatusLabel(s, locale)}</option>
            ))}
          </select>
          <Button type="submit" variant="outline">{ar ? "تصفية" : "Filter"}</Button>
          {(q || status) && (
            <Button type="button" variant="ghost" asChild>
              <Link href="/laboratory">{ar ? "مسح" : "Clear"}</Link>
            </Button>
          )}
        </form>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{ar ? "المريض" : "Patient"}</TableHead>
                <TableHead>{ar ? "الطبيب" : "Dentist"}</TableHead>
                <TableHead>{ar ? "التركيبة" : "Restoration"}</TableHead>
                <TableHead>{ar ? "الأسنان" : "Teeth"}</TableHead>
                <TableHead>{ar ? "المختبر" : "Lab"}</TableHead>
                <TableHead>{ar ? "الحالة" : "Status"}</TableHead>
                <TableHead>{ar ? "العودة المتوقعة" : "Expected return"}</TableHead>
                <TableHead className="text-end">{ar ? "التكلفة" : "Cost"}</TableHead>
                {user.permissions.includes("laboratory:edit") && (
                  <TableHead className="text-end">{ar ? "إجراءات" : "Actions"}</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-16 text-center text-sm text-muted-foreground">{ar ? "لا توجد حالات مختبر" : "No lab cases found"}</TableCell>
                </TableRow>
              ) : (
                rows.map((c) => {
                  const col = statusColor(c.status)
                  const lite: LabCaseLite = {
                    id: c.id,
                    patientId: c.patientId,
                    dentistId: c.dentistId,
                    toothNumbers: c.toothNumbers,
                    restorationType: c.restorationType,
                    labName: c.labName,
                    expectedReturn: c.expectedReturn ? c.expectedReturn.toISOString() : null,
                    cost: String(c.cost),
                    status: c.status,
                    notes: c.notes,
                  }
                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="font-medium">
                          {[c.patient.firstName, c.patient.middleName, c.patient.lastName].filter(Boolean).join(" ")}
                        </div>
                        <div className="font-mono text-xs text-muted-foreground">{c.patient.patientNo}</div>
                      </TableCell>
                      <TableCell>{c.dentist ? (ar && c.dentist.user.nameAr ? c.dentist.user.nameAr : c.dentist.user.name) : "—"}</TableCell>
                      <TableCell>{c.restorationType ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{c.toothNumbers.length ? c.toothNumbers.join(", ") : "—"}</TableCell>
                      <TableCell>{c.labName ?? "—"}</TableCell>
                      <TableCell>
                        <span
                          className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs"
                          style={{ borderColor: col.border, color: col.text, background: col.bg }}
                        >
                          {labStatusLabel(c.status, locale)}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{formatDate(c.expectedReturn, locale)}</TableCell>
                      <TableCell className="text-end tabular-nums">{formatCurrency(c.cost)}</TableCell>
                      {user.permissions.includes("laboratory:edit") && (
                        <TableCell className="text-end">
                          <LabCaseFormDialog
                            existing={lite}
                            patients={patientOptions}
                            dentists={dentistOptions}
                            trigger={<Button variant="outline" size="sm">{ar ? "تعديل" : "Edit"}</Button>}
                          />
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

        <Pagination page={page} totalPages={totalPages} totalItems={total} perPage={PER_PAGE} basePath="/laboratory" preservedQuery={preservedQuery} />
      </Card>
    </div>
  )
}
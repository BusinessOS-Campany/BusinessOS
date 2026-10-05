import { requirePermission } from "@/lib/dal"
import { prisma } from "@/lib/prisma"
import { cookies } from "next/headers"
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { LANG_COOKIE, localeFrom, type Locale } from "@/lib/i18n"
import { statusColor } from "@/lib/status-ui"
import { formatCurrency, formatDate } from "@/lib/format"
import { TreatmentPlanFormDialog, type PlanOption, type ProcedureOption } from "@/components/treatment-plans/plan-form-dialog"
import { ProcedureManagerDialog, type ProcedureRecord } from "@/components/treatment-plans/procedure-manager-dialog"
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

const PER_PAGE = 10

export default async function TreatmentPlansPage({ searchParams }: { searchParams?: SearchParams }) {
  const user = await requirePermission("treatmentPlans:view")
  const cookieStore = await cookies()
  const locale: Locale = localeFrom(cookieStore.get(LANG_COOKIE)?.value)
  const url: Params = (await searchParams) ?? {}
  const ar = locale === "ar"
  const q = sp(url, "q")?.trim() ?? ""
  const status = sp(url, "status") ?? ""
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
            ],
          },
        }
      : {}),
    ...(status ? { status: status as never } : {}),
  }

  const [total, rows, patients, dentists, procedures] = await Promise.all([
    prisma.treatmentPlan.count({ where }),
    prisma.treatmentPlan.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      include: {
        patient: { select: { id: true, patientNo: true, firstName: true, middleName: true, lastName: true } },
        dentist: { select: { user: { select: { name: true, nameAr: true } } } },
        procedures: { select: { id: true } },
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

  const patientOptions: PlanOption[] = patients.map((p) => ({
    id: p.id,
    label: `${p.patientNo} · ${[p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ")}`,
  }))
  const dentistOptions: PlanOption[] = dentists.map((d) => ({
    id: d.id,
    label: d.user.nameAr && ar ? d.user.nameAr : d.user.name,
  }))
  const procedureOptions: ProcedureOption[] = procedures.map((p) => ({
    id: p.id,
    label: `${p.code} · ${ar ? p.nameAr : p.nameEn} (${formatCurrency(p.price)})`,
  }))
  const procedureRecords: ProcedureRecord[] = await prisma.procedure
    .findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, nameEn: true, nameAr: true, category: true, price: true, isActive: true } })
    .then((rs) => rs.map((r) => ({ ...r, price: String(r.price) })))

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))
  const preserved = new URLSearchParams()
  if (q) preserved.set("q", q)
  if (status) preserved.set("status", status)
  const preservedQuery = preserved.toString()

  return (
    <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{ar ? "خطط العلاج" : "Treatment Plans"}</h1>
          <p className="text-sm text-muted-foreground">{total} {ar ? "خطة" : "plans"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {user.permissions.includes("treatmentPlans:create") && (
            <TreatmentPlanFormDialog
              patients={patientOptions}
              dentists={dentistOptions}
              procedures={procedureOptions}
              defaultDentistId={user.isDentist ? user.dentistId ?? undefined : undefined}
            />
          )}
          {user.permissions.includes("clinical:create") && (
            <ProcedureManagerDialog records={procedureRecords} />
          )}
        </div>
      </div>

      <Card className="overflow-hidden">
        <form method="GET" action="/treatment-plans" className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <Input type="search" name="q" defaultValue={q} placeholder={ar ? "بحث بالاسم أو رقم المريض…" : "Search patient…"} className="w-full" />
          </div>
          <select
            name="status"
            defaultValue={status}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">{ar ? "كل الحالات" : "All statuses"}</option>
            {["DRAFT", "PROPOSED", "ACCEPTED", "IN_PROGRESS", "PARTIALLY_COMPLETED", "COMPLETED", "REJECTED", "CANCELLED"].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <Button type="submit" variant="outline">{ar ? "تصفية" : "Filter"}</Button>
          {(q || status) && (
            <Button type="button" variant="ghost" asChild>
              <Link href="/treatment-plans">{ar ? "مسح" : "Clear"}</Link>
            </Button>
          )}
        </form>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{ar ? "الخطة" : "Plan"}</TableHead>
                <TableHead>{ar ? "المريض" : "Patient"}</TableHead>
                <TableHead>{ar ? "الحالة" : "Status"}</TableHead>
                <TableHead>{ar ? "التكلفة النهائية" : "Final cost"}</TableHead>
                <TableHead>{ar ? "تاريخ الإنشاء" : "Created"}</TableHead>
                <TableHead className="text-end">{ar ? "إجراءات" : "Actions"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-16 text-center text-sm text-muted-foreground">{ar ? "لا توجد بيانات" : "No data available"}</TableCell>
                </TableRow>
              ) : (
                rows.map((plan) => {
                  const c = statusColor(plan.status)
                  const patientName = [plan.patient.firstName, plan.patient.middleName, plan.patient.lastName].filter(Boolean).join(" ")
                  return (
                    <TableRow key={plan.id}>
                      <TableCell>
                        <p className="font-medium">{locale === "ar" ? plan.nameAr : plan.nameEn}</p>
                        <p className="text-xs text-muted-foreground">{plan.procedures.length} {ar ? "إجراء" : "procedures"}</p>
                      </TableCell>
                      <TableCell>
                        <Link href={`/patients/${plan.patient.id}`} className="hover:underline">{patientName}</Link>
                        <p className="text-xs text-muted-foreground">{plan.patient.patientNo}</p>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs" style={{ borderColor: c.border, color: c.text, background: c.bg }}>
                          {plan.status}
                        </span>
                      </TableCell>
                      <TableCell className="tabular-nums">{formatCurrency(plan.finalCost)}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(plan.createdAt, locale)}</TableCell>
                      <TableCell className="text-end">
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/treatment-plans/${plan.id}`}>
                            {ar ? "عرض" : "View"}
                            <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" />
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

        <Pagination page={page} totalPages={totalPages} totalItems={total} perPage={PER_PAGE} basePath="/treatment-plans" preservedQuery={preservedQuery} />
      </Card>
    </div>
  )
}
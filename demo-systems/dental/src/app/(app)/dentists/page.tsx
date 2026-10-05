import { requirePermission } from "@/lib/dal"
import { prisma } from "@/lib/prisma"
import { cookies } from "next/headers"
import Link from "next/link"
import { Stethoscope } from "lucide-react"
import { LANG_COOKIE, localeFrom, type Locale } from "@/lib/i18n"
import { specialtyLabel, workingDayLabel } from "@/lib/constants/admin"
import { DentistFormDialog, type DentistLite, type UserOption } from "@/components/dentists/dentist-form-dialog"
import { Pagination } from "@/components/patients/pagination"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type Params = { [key: string]: string | string[] | undefined }
type SearchParams = Promise<Params>

function sp(params: Params | undefined, key: string): string | undefined {
  const v = params?.[key]
  return typeof v === "string" ? v : undefined
}

const PER_PAGE = 15

export default async function DentistsPage({ searchParams }: { searchParams?: SearchParams }) {
  const user = await requirePermission("dentists:view")
  const cookieStore = await cookies()
  const locale: Locale = localeFrom(cookieStore.get(LANG_COOKIE)?.value)
  const ar = locale === "ar"
  const url: Params = (await searchParams) ?? {}

  const q = sp(url, "q")?.trim() ?? ""
  const page = Math.max(1, Number(sp(url, "page")) || 1)

  const where = {
    ...(q
      ? {
          user: {
            isActive: true,
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { nameAr: { contains: q, mode: "insensitive" as const } },
            ],
          },
        }
      : {}),
  }

  const [total, rows, userPool, appointmentCounts] = await Promise.all([
    prisma.dentist.count({ where }),
    prisma.dentist.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      include: {
        user: { select: { id: true, name: true, nameAr: true, isActive: true } },
        _count: { select: { appointments: true } },
      },
    }),
    prisma.user.findMany({
      where: {
        isActive: true,
        isDentist: false,
        ...(user.branchId ? { OR: [{ branchId: user.branchId }, { branchId: null }] } : {}),
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, nameAr: true },
    }),
    prisma.dentist
      .findMany({
        select: { id: true, _count: { select: { appointments: true } } },
      })
      .then((r) => new Map(r.map((d) => [d.id, d._count.appointments]))),
  ])

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))
  const preserved = new URLSearchParams()
  if (q) preserved.set("q", q)
  const preservedQuery = preserved.toString()

  const userOptions: UserOption[] = userPool.map((u) => ({
    id: u.id,
    label: ar && u.nameAr ? `${u.nameAr} (${u.name})` : u.name,
  }))

  return (
    <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{ar ? "الأطباء" : "Dentists"}</h1>
          <p className="text-sm text-muted-foreground">{total} {ar ? "طبيب" : "dentists"}</p>
        </div>
        {user.permissions.includes("dentists:create") && (
          <DentistFormDialog
            users={userOptions}
            trigger={
              <Button>
                <Stethoscope className="h-4 w-4" />
                {ar ? "طبيب جديد" : "New Dentist"}
              </Button>
            }
          />
        )}
      </div>

      <Card className="overflow-hidden">
        <form method="GET" action="/dentists" className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <Input type="search" name="q" defaultValue={q} placeholder={ar ? "بحث بالاسم…" : "Search name…"} className="w-full" />
          </div>
          <Button type="submit" variant="outline">{ar ? "تصفية" : "Filter"}</Button>
          {q && (
            <Button type="button" variant="ghost" asChild>
              <Link href="/dentists">{ar ? "مسح" : "Clear"}</Link>
            </Button>
          )}
        </form>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{ar ? "الطبيب" : "Dentist"}</TableHead>
                <TableHead>{ar ? "التخصص" : "Specialty"}</TableHead>
                <TableHead>{ar ? "رقم الترخيص" : "License"}</TableHead>
                <TableHead>{ar ? "أيام العمل" : "Working days"}</TableHead>
                <TableHead>{ar ? "المواعيد" : "Appointments"}</TableHead>
                <TableHead>{ar ? "الحالة" : "Status"}</TableHead>
                {user.permissions.includes("dentists:edit") && (
                  <TableHead className="text-end">{ar ? "إجراءات" : "Actions"}</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-16 text-center text-sm text-muted-foreground">{ar ? "لا يوجد أطباء" : "No dentists found"}</TableCell>
                </TableRow>
              ) : (
                rows.map((d) => {
                  const label = ar && d.user.nameAr ? d.user.nameAr : d.user.name
                  const lite: DentistLite = {
                    id: d.id,
                    userId: d.userId,
                    userLabel: label,
                    specialty: d.specialty,
                    licenseNumber: d.licenseNumber,
                    workingDays: d.workingDays,
                    isActive: d.isActive,
                  }
                  return (
                    <TableRow key={d.id}>
                      <TableCell>
                        <div className="font-medium">{label}</div>
                        {!d.user.isActive && (
                          <div className="text-xs text-destructive">{ar ? "الحساب غير نشط" : "Disabled account"}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{d.specialty ? specialtyLabel(d.specialty, locale) : "—"}</TableCell>
                      <TableCell dir="ltr" className="text-sm">{d.licenseNumber ?? "—"}</TableCell>
                      <TableCell className="text-sm">
                        <div className="flex max-w-xs flex-wrap gap-1">
                          {d.workingDays.length === 0 ? (
                            "—"
                          ) : (
                            d.workingDays.map((day) => (
                              <Badge key={day} variant="outline">{workingDayLabel(day, locale)}</Badge>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">{appointmentCounts.get(d.id) ?? d._count.appointments}</TableCell>
                      <TableCell>
                        <Badge variant={d.isActive ? "success" : "secondary"}>{d.isActive ? (ar ? "نشط" : "Active") : (ar ? "غير نشط" : "Inactive")}</Badge>
                      </TableCell>
                      {user.permissions.includes("dentists:edit") && (
                        <TableCell className="text-end">
                          <DentistFormDialog
                            existing={lite}
                            users={userOptions}
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

        <Pagination page={page} totalPages={totalPages} totalItems={total} perPage={PER_PAGE} basePath="/dentists" preservedQuery={preservedQuery} />
      </Card>
    </div>
  )
}
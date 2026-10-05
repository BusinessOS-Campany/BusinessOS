import { requirePermission } from "@/lib/dal"
import { prisma } from "@/lib/prisma"
import { cookies } from "next/headers"
import Link from "next/link"
import { UserPlus } from "lucide-react"
import { LANG_COOKIE, localeFrom, type Locale } from "@/lib/i18n"
import { formatDate } from "@/lib/format"
import { StaffFormDialog, type StaffLite, type RoleOption, type BranchOption } from "@/components/staff/staff-form-dialog"
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

export default async function StaffPage({ searchParams }: { searchParams?: SearchParams }) {
  const user = await requirePermission("staff:view")
  const cookieStore = await cookies()
  const locale: Locale = localeFrom(cookieStore.get(LANG_COOKIE)?.value)
  const ar = locale === "ar"
  const url: Params = (await searchParams) ?? {}

  const q = sp(url, "q")?.trim() ?? ""
  const page = Math.max(1, Number(sp(url, "page")) || 1)

  const where = {
    ...(user.branchId ? { branchId: user.branchId } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { username: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
            { phone: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  }

  const [total, rows, roles, branches] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      include: {
        role: { select: { id: true, key: true, nameAr: true } },
        branch: { select: { id: true, name: true, nameAr: true } },
      },
    }),
    prisma.role.findMany({ orderBy: { key: "asc" }, select: { id: true, key: true, nameAr: true } }),
    prisma.branch.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, nameAr: true } }),
  ])

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))
  const preserved = new URLSearchParams()
  if (q) preserved.set("q", q)
  const preservedQuery = preserved.toString()

  const roleOptions: RoleOption[] = roles.map((r) => ({ id: r.id, key: r.key, nameAr: r.nameAr }))
  const branchOptions: BranchOption[] = branches.map((b) => ({ id: b.id, name: b.name, nameAr: b.nameAr }))

  return (
    <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{ar ? "الموظفون" : "Staff"}</h1>
          <p className="text-sm text-muted-foreground">{total} {ar ? "موظف" : "staff members"}</p>
        </div>
        {user.permissions.includes("staff:create") && (
          <StaffFormDialog
            roles={roleOptions}
            branches={branchOptions}
            trigger={
              <Button>
                <UserPlus className="h-4 w-4" />
                {ar ? "موظف جديد" : "New Staff"}
              </Button>
            }
          />
        )}
      </div>

      <Card className="overflow-hidden">
        <form method="GET" action="/staff" className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <Input type="search" name="q" defaultValue={q} placeholder={ar ? "بحث بالأسم أو البريد…" : "Search name or email…"} className="w-full" />
          </div>
          <Button type="submit" variant="outline">{ar ? "تصفية" : "Filter"}</Button>
          {q && (
            <Button type="button" variant="ghost" asChild>
              <Link href="/staff">{ar ? "مسح" : "Clear"}</Link>
            </Button>
          )}
        </form>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
<TableRow>
              <TableHead>{ar ? "الاسم" : "Name"}</TableHead>
              <TableHead>{ar ? "اسم المستخدم" : "Username"}</TableHead>
              <TableHead>{ar ? "البريد الإلكتروني" : "Email"}</TableHead>
              <TableHead>{ar ? "الهاتف" : "Phone"}</TableHead>
              <TableHead>{ar ? "الدور" : "Role"}</TableHead>
              <TableHead>{ar ? "الفرع" : "Branch"}</TableHead>
              <TableHead>{ar ? "الحالة" : "Status"}</TableHead>
              <TableHead>{ar ? "آخر تسجيل دخول" : "Last login"}</TableHead>
              {user.permissions.includes("staff:edit") && (
                <TableHead className="text-end">{ar ? "إجراءات" : "Actions"}</TableHead>
              )}
            </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-16 text-center text-sm text-muted-foreground">{ar ? "لا يوجد موظفون" : "No staff members found"}</TableCell>
                </TableRow>
              ) : (
                rows.map((m) => {
                  const lite: StaffLite = {
                    id: m.id,
                    name: m.name,
                    nameAr: m.nameAr,
                    username: m.username,
                    email: m.email,
                    phone: m.phone,
                    roleId: m.role.id,
                    branchId: m.branchId,
                    isActive: m.isActive,
                  }
                  const label = ar && m.nameAr ? m.nameAr : m.name
                  return (
                    <TableRow key={m.id}>
                      <TableCell>
                        <div className="font-medium">{label}</div>
                        {m.isDentist && (
                          <div className="text-xs text-muted-foreground">{ar ? "طبيب" : "Dentist"}</div>
                        )}
                      </TableCell>
                      <TableCell dir="ltr" className="text-xs font-mono">{m.username ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{m.email}</TableCell>
                      <TableCell dir="ltr" className="text-sm">{m.phone ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{ar ? (m.role.nameAr ?? m.role.key) : m.role.key}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{m.branch ? (ar && m.branch.nameAr ? m.branch.nameAr : m.branch.name) : "—"}</TableCell>
                      <TableCell>
                        <Badge variant={m.isActive ? "success" : "secondary"}>{m.isActive ? (ar ? "نشط" : "Active") : (ar ? "غير نشط" : "Inactive")}</Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{formatDate(m.lastLoginAt, locale)}</TableCell>
                      {user.permissions.includes("staff:edit") && m.id !== user.id && (
                        <TableCell className="text-end">
                          <StaffFormDialog
                            existing={lite}
                            roles={roleOptions}
                            branches={branchOptions}
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

        <Pagination page={page} totalPages={totalPages} totalItems={total} perPage={PER_PAGE} basePath="/staff" preservedQuery={preservedQuery} />
      </Card>
    </div>
  )
}
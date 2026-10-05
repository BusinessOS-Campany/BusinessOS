import { requirePermission } from "@/lib/dal"
import { prisma } from "@/lib/prisma"
import { cookies } from "next/headers"
import Link from "next/link"
import { LANG_COOKIE, localeFrom, type Locale } from "@/lib/i18n"
import { formatDateTime } from "@/lib/format"
import { AUDIT_MODULES, auditModuleLabel } from "@/lib/constants/admin"
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

const PER_PAGE = 20

const actionColor: Record<string, { variant: "default" | "secondary" | "destructive" | "success" | "warning" | "outline" }> = {
  CREATE: { variant: "success" },
  UPDATE: { variant: "warning" },
  DELETE: { variant: "destructive" },
  LOGIN: { variant: "secondary" },
}

export default async function AuditLogPage({ searchParams }: { searchParams?: SearchParams }) {
  await requirePermission("audit:view")
  const cookieStore = await cookies()
  const locale: Locale = localeFrom(cookieStore.get(LANG_COOKIE)?.value)
  const ar = locale === "ar"
  const url: Params = (await searchParams) ?? {}

  const q = sp(url, "q")?.trim() ?? ""
  const moduleFilter = sp(url, "module") ?? ""
  const page = Math.max(1, Number(sp(url, "page")) || 1)

  const where = {
    ...(moduleFilter && AUDIT_MODULES.includes(moduleFilter) ? { module: moduleFilter } : {}),
    ...(q
      ? {
          OR: [
            { user: { name: { contains: q, mode: "insensitive" as const } } },
            { recordId: { contains: q, mode: "insensitive" as const } },
            { action: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  }

  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      include: { user: { select: { id: true, name: true, nameAr: true } } },
    }),
  ])

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))
  const preserved = new URLSearchParams()
  if (q) preserved.set("q", q)
  if (moduleFilter) preserved.set("module", moduleFilter)
  const preservedQuery = preserved.toString()

  return (
    <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{ar ? "سجل التدقيق" : "Audit Log"}</h1>
        <p className="text-sm text-muted-foreground">{total} {ar ? "سجل" : "entries"}</p>
      </div>

      <Card className="overflow-hidden">
        <form method="GET" action="/audit-log" className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <Input type="search" name="q" defaultValue={q} placeholder={ar ? "بحث بالمستخدم أو الإجراء…" : "Search user or action…"} className="w-full" />
          </div>
          <select
            name="module"
            defaultValue={moduleFilter}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">{ar ? "كل الوحدات" : "All modules"}</option>
            {AUDIT_MODULES.map((m) => (
              <option key={m} value={m}>{auditModuleLabel(m, locale)}</option>
            ))}
          </select>
          <Button type="submit" variant="outline">{ar ? "تصفية" : "Filter"}</Button>
          {(q || moduleFilter) && (
            <Button type="button" variant="ghost" asChild>
              <Link href="/audit-log">{ar ? "مسح" : "Clear"}</Link>
            </Button>
          )}
        </form>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{ar ? "التاريخ" : "Date"}</TableHead>
                <TableHead>{ar ? "الوحدة" : "Module"}</TableHead>
                <TableHead>{ar ? "الإجراء" : "Action"}</TableHead>
                <TableHead>{ar ? "المستخدم" : "User"}</TableHead>
                <TableHead>{ar ? "السجل" : "Record"}</TableHead>
                <TableHead>{ar ? "التفاصيل" : "Details"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-16 text-center text-sm text-muted-foreground">{ar ? "لا توجد سجلات تدقيق" : "No audit entries found"}</TableCell>
                </TableRow>
              ) : (
                rows.map((e) => {
                  const color = actionColor[e.action] ?? { variant: "outline" as const }
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="whitespace-nowrap text-sm">{formatDateTime(e.createdAt, locale)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{auditModuleLabel(e.module, locale)}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={color.variant}>{e.action}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{e.user ? (ar && e.user.nameAr ? e.user.nameAr : e.user.name) : "—"}</TableCell>
                      <TableCell dir="ltr" className="text-xs font-mono text-muted-foreground">{e.recordId ?? "—"}</TableCell>
                      <TableCell className="max-w-xs">
                        {e.newValue ? (
                          <details>
                            <summary className="cursor-pointer text-xs text-muted-foreground">{ar ? "عرض التفاصيل" : "Show details"}</summary>
                            <pre dir="ltr" className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded border bg-muted p-2 font-mono text-[10px]">
                              {JSON.stringify(e.newValue, null, 2)}
                            </pre>
                          </details>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

        <Pagination page={page} totalPages={totalPages} totalItems={total} perPage={PER_PAGE} basePath="/audit-log" preservedQuery={preservedQuery} />
      </Card>
    </div>
  )
}
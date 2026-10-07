import { requirePermission } from "@/lib/dal"
import { prisma } from "@/lib/prisma"
import Link from "next/link"
import { getI18n } from "@/lib/i18n-server"
import type { Dictionary } from "@/lib/i18n"
import { formatDateTime } from "@/lib/format"
import { AUDIT_MODULES } from "@/lib/constants/admin"
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

const MODULE_LABELS: Record<string, keyof Dictionary["nav"]> = {
  Patients: "patients",
  Appointments: "appointments",
  WaitingRoom: "waitingRoom",
  "Waiting Room": "waitingRoom",
  DentalChart: "dentalChart",
  "Dental Chart": "dentalChart",
  Clinical: "clinic",
  TreatmentPlans: "treatmentPlans",
  "Treatment Plans": "treatmentPlans",
  Prescriptions: "prescriptions",
  Imaging: "imaging",
  Invoices: "invoices",
  Payments: "payments",
  Installments: "installments",
  Expenses: "expenses",
  Inventory: "inventory",
  Suppliers: "suppliers",
  Laboratory: "laboratory",
  Procedures: "procedures",
  Staff: "staff",
  Dentists: "dentists",
  Settings: "settings",
  Notifications: "notifications",
  Auth: "auth",
}

export default async function AuditLogPage({ searchParams }: { searchParams?: SearchParams }) {
  await requirePermission("audit:view")
  const { t, locale } = await getI18n()
  const ar = locale === "ar"
  const url: Params = (await searchParams) ?? {}

  const moduleLabel = (m: string): string => {
    const key = MODULE_LABELS[m]
    return key ? t.nav[key] : m
  }

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
        <h1 className="text-2xl font-bold tracking-tight">{t.audit.title}</h1>
        <p className="text-sm text-muted-foreground">{t.page.totalEntries.replace("{count}", String(total))}</p>
      </div>

      <Card className="overflow-hidden">
        <form method="GET" action="/audit-log" className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <Input type="search" name="q" defaultValue={q} placeholder={t.page.searchUserAction} className="w-full" />
          </div>
          <select
            name="module"
            defaultValue={moduleFilter}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">{t.audit.filterModule}</option>
            {AUDIT_MODULES.map((m) => (
              <option key={m} value={m}>{moduleLabel(m)}</option>
            ))}
          </select>
          <Button type="submit" variant="outline">{t.common.filter}</Button>
          {(q || moduleFilter) && (
            <Button type="button" variant="ghost" asChild>
              <Link href="/audit-log">{t.common.clear}</Link>
            </Button>
          )}
        </form>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.common.date}</TableHead>
                <TableHead>{t.audit.module}</TableHead>
                <TableHead>{t.audit.action}</TableHead>
                <TableHead>{t.audit.user}</TableHead>
                <TableHead>{t.page.record}</TableHead>
                <TableHead>{t.audit.details}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-16 text-center text-sm text-muted-foreground">{t.audit.noData}</TableCell>
                </TableRow>
              ) : (
                rows.map((e) => {
                  const color = actionColor[e.action] ?? { variant: "outline" as const }
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="whitespace-nowrap text-sm">{formatDateTime(e.createdAt, locale)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{moduleLabel(e.module)}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={color.variant}>{t.auditActions[e.action as keyof typeof t.auditActions] ?? e.action}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{e.user ? (ar && e.user.nameAr ? e.user.nameAr : e.user.name) : "—"}</TableCell>
                      <TableCell dir="ltr" className="text-xs font-mono text-muted-foreground">{e.recordId ?? "—"}</TableCell>
                      <TableCell className="max-w-xs">
                        {e.newValue ? (
                          <details>
                            <summary className="cursor-pointer text-xs text-muted-foreground">{t.page.showDetails}</summary>
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
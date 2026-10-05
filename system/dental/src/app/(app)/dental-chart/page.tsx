import { requirePermission } from "@/lib/dal"
import { prisma } from "@/lib/prisma"
import { cookies } from "next/headers"
import Link from "next/link"
import { LANG_COOKIE, dictionary, localeFrom, type Locale } from "@/lib/i18n"
import { DentalChartView } from "@/components/dental-chart/dental-chart-view"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type Params = { [key: string]: string | string[] | undefined }
type SearchParams = Promise<Params>

function sp(params: Params | undefined, key: string): string | undefined {
  const v = params?.[key]
  return typeof v === "string" ? v : undefined
}

export default async function DentalChartPage({ searchParams }: { searchParams?: SearchParams }) {
  const user = await requirePermission("dentalChart:view")
  const url: Params = (await searchParams) ?? {}
  const cookieStore = await cookies()
  const locale: Locale = localeFrom(cookieStore.get(LANG_COOKIE)?.value)
  const t = dictionary[locale]

  const q = sp(url, "q")?.trim() ?? ""
  const patientId = sp(url, "patient") ?? ""

  const [patients, patient, records] = await Promise.all([
    prisma.patient.findMany({
      where: {
        deletedAt: null,
        ...(user.branchId ? { branchId: user.branchId } : {}),
        ...(q
          ? {
              OR: [
                { firstName: { contains: q, mode: "insensitive" as const } },
                { lastName: { contains: q, mode: "insensitive" as const } },
                { patientNo: { contains: q, mode: "insensitive" as const } },
                { phone: { contains: q, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: { id: true, patientNo: true, firstName: true, middleName: true, lastName: true, phone: true },
    }),
    patientId
      ? prisma.patient.findUnique({
          where: { id: patientId },
          select: {
            id: true,
            patientNo: true,
            firstName: true,
            middleName: true,
            lastName: true,
            gender: true,
            phone: true,
            city: true,
          },
        })
      : Promise.resolve(null),
    patientId
      ? prisma.toothRecord
          .findMany({
            where: { patientId },
            include: {
              conditions: { where: { status: "ACTIVE" }, orderBy: { createdAt: "asc" } },
            },
          })
          .then((rows) =>
            rows.map((r) => ({
              id: r.id,
              toothNumber: r.toothNumber,
              dentition: r.dentition as "ADULT" | "PRIMARY",
              conditions: r.conditions.map((c) => ({
                id: c.id,
                condition: c.condition,
                surfaces: c.surfaces,
                severity: c.severity ? (c.severity as string) : null,
                notes: c.notes,
                date: c.date.toISOString(),
              })),
            }))
          )
      : Promise.resolve([]),
  ])

  const selectedId = patientId && patient ? patientId : ""
  const canEdit = user.permissions.includes("dentalChart:edit")

  const patientName = patient ? [patient.firstName, patient.middleName, patient.lastName].filter(Boolean).join(" ") : ""

  const preserved = new URLSearchParams()
  if (q) preserved.set("q", q)

  return (
    <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t.dentalChart.title}</h1>
          <p className="text-sm text-muted-foreground">
            {locale === "ar" ? "اختر المريض لعرض مخطط أسنانه" : "Choose a patient to view their dental chart"}
          </p>
        </div>
      </div>

      <Card className="mb-6 p-4">
        <form method="GET" action="/dental-chart" className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            type="search"
            name="q"
            defaultValue={q}
            placeholder={locale === "ar" ? "بحث بالاسم أو رقم المريض أو الهاتف…" : "Search name, patient no., phone…"}
            className="flex-1"
          />
          {!q && patient && (
            <>
              <input type="hidden" name="patient" value={patientId} />
            </>
          )}
          <Button type="submit" variant="outline">
            {t.common.search}
          </Button>
          {q && (
            <Button type="button" variant="ghost" asChild>
              <Link href={patientId ? `/dental-chart?patient=${patientId}` : "/dental-chart"}>{t.common.clear}</Link>
            </Button>
          )}
        </form>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {patients.map((p) => {
            const name = [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ")
            const active = p.id === selectedId
            return (
              <Link
                key={p.id}
                href={`/dental-chart${q ? `?q=${encodeURIComponent(q)}` : ""}${q ? "&" : "?"}patient=${p.id}`}
                className={cn(
                  "rounded-lg border p-3 text-sm transition-colors",
                  active ? "border-primary bg-primary/5" : "hover:bg-accent"
                )}
              >
                <p className="font-medium leading-tight">{name}</p>
                <p className="text-xs text-muted-foreground">
                  {p.patientNo}
                  {p.phone ? ` · ${p.phone}` : ""}
                </p>
              </Link>
            )
          })}
          {patients.length === 0 && (
            <p className="col-span-full py-6 text-center text-sm text-muted-foreground">{t.common.noData}</p>
          )}
        </div>
      </Card>

      {selectedId && (
        <Card className="p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b pb-3">
            <div>
              <h2 className="text-lg font-semibold">{patientName}</h2>
              <p className="text-xs text-muted-foreground">
                {patient?.patientNo}
                {patient?.city ? ` · ${patient.city}` : ""}
              </p>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/patients/${patient!.id}`}>
                {locale === "ar" ? "ملف المريض" : "Patient profile"}
              </Link>
            </Button>
          </div>
          <DentalChartView patientId={selectedId} records={records} canEdit={canEdit} locale={locale} />
        </Card>
      )}
    </div>
  )
}
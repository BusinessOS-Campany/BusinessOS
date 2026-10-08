import { requirePermission } from "@/lib/dal"
import { prisma } from "@/lib/prisma"
import Link from "next/link"
import { Upload } from "lucide-react"
import { getI18n } from "@/lib/i18n-server"
import { IMAGING_TYPES } from "@/lib/constants/imaging"
import { ImagingUploadDialog } from "@/components/imaging/imaging-upload-dialog"
import { ImagingGrid, type ImagingCardRecord } from "@/components/imaging/imaging-grid"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"

type Params = { [key: string]: string | string[] | undefined }
type SearchParams = Promise<Params>

function sp(params: Params | undefined, key: string): string | undefined {
  const v = params?.[key]
  return typeof v === "string" ? v : undefined
}

const PER_PAGE = 24

const isImagingType = (v: string): v is (typeof IMAGING_TYPES)[number]["value"] =>
  IMAGING_TYPES.some((t) => t.value === v)

export default async function ImagingPage({ searchParams }: { searchParams?: SearchParams }) {
  const user = await requirePermission("imaging:view")
  const { t } = await getI18n()
  const url: Params = (await searchParams) ?? {}

  const q = sp(url, "q")?.trim() ?? ""
  const typeParam = sp(url, "type") ?? ""
  const type = isImagingType(typeParam) ? typeParam : undefined
  const page = Math.max(1, Number(sp(url, "page")) || 1)

  const where = {
    ...(user.branchId ? { branchId: user.branchId } : {}),
    ...(type ? { type } : {}),
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

  const [total, rows, patients] = await Promise.all([
    prisma.imaging.count({ where }),
    prisma.imaging.findMany({
      where,
      orderBy: { date: "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      include: {
        patient: { select: { id: true, patientNo: true, firstName: true, middleName: true, lastName: true } },
        uploadedBy: { select: { name: true } },
      },
    }),
    prisma.patient.findMany({
      where: { deletedAt: null, ...(user.branchId ? { branchId: user.branchId } : {}) },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: { id: true, patientNo: true, firstName: true, middleName: true, lastName: true },
    }),
  ])

  const records: ImagingCardRecord[] = rows.map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    notes: r.notes,
    filePath: r.filePath,
    mimeType: r.mimeType,
    date: r.date.toISOString(),
    patientId: r.patient.id,
    patientName: [r.patient.firstName, r.patient.middleName, r.patient.lastName].filter(Boolean).join(" "),
    patientNo: r.patient.patientNo,
  }))

  const patientOptions = patients.map((p) => ({
    id: p.id,
    label: `${p.patientNo} · ${[p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ")}`,
  }))

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))
  const preserved = new URLSearchParams()
  if (q) preserved.set("q", q)
  if (type) preserved.set("type", type)
  const preservedQuery = preserved.toString()

  return (
    <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t.imaging.title}</h1>
          <p className="text-sm text-muted-foreground">{t.page.totalImaging.replace("{count}", String(total))}</p>
        </div>
        {user.permissions.includes("imaging:create") && (
          <ImagingUploadDialog
            patients={patientOptions}
            trigger={
              <Button>
                <Upload className="h-4 w-4" />
                {t.imaging.upload}
              </Button>
            }
          />
        )}
      </div>

      <Card className="overflow-hidden">
        <form method="GET" action="/imaging" className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <Input type="search" name="q" defaultValue={q} placeholder={t.page.searchPatientNo} className="w-full" />
          </div>
          <select
            name="type"
            defaultValue={type ?? ""}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">{t.ui.allTypes}</option>
            {IMAGING_TYPES.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t.imagingTypes[opt.value] ?? opt.value}
              </option>
            ))}
          </select>
          <Button type="submit" variant="outline">
            {t.common.filter}
          </Button>
          {(q || type) && (
            <Button type="button" variant="ghost" asChild>
              <Link href="/imaging">{t.common.clear}</Link>
            </Button>
          )}
        </form>

        <ImagingGrid records={records} canDelete={user.permissions.includes("imaging:delete")} />

        <div className="flex items-center justify-between border-t p-4 text-sm">
          <p className="text-muted-foreground">
            {t.common.page} {page} {t.common.of} {totalPages}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} asChild={page > 1}>
              {page > 1 ? (
                <Link href={`/imaging?page=${page - 1}${preservedQuery ? `&${preservedQuery}` : ""}`}>
                  {t.common.previous}
                </Link>
              ) : (
                <span>{t.common.previous}</span>
              )}
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} asChild={page < totalPages}>
              {page < totalPages ? (
                <Link href={`/imaging?page=${page + 1}${preservedQuery ? `&${preservedQuery}` : ""}`}>
                  {t.common.next}
                </Link>
              ) : (
                <span>{t.common.next}</span>
              )}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
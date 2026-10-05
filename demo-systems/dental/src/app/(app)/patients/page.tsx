import { requirePermission } from "@/lib/dal"
import { prisma } from "@/lib/prisma"
import Link from "next/link"
import { UserPlus } from "lucide-react"
import { PatientsTable } from "@/components/patients/patient-table"
import { Pagination } from "@/components/patients/pagination"
import { PatientFormDialog } from "@/components/patients/patient-form-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"

type Params = { [key: string]: string | string[] | undefined }
type SearchParams = Promise<Params>

function sp(params: Params | undefined, key: string): string | undefined {
  const v = params?.[key]
  return typeof v === "string" ? v : undefined
}

const PER_PAGE = 10

export default async function PatientsPage({
  searchParams,
}: {
  searchParams?: SearchParams
}) {
  const user = await requirePermission("patients:view")
  const url: Params = (await searchParams) ?? {}

  const q = sp(url, "q")?.trim() ?? ""
  const status = sp(url, "status") ?? ""
  const genderParam = sp(url, "gender") ?? ""
  const page = Math.max(1, Number(sp(url, "page")) || 1)
  const perPage = PER_PAGE

  const gender = genderParam === "MALE" || genderParam === "FEMALE" ? (genderParam as "MALE" | "FEMALE") : undefined

  const where = {
    deletedAt: null,
    ...(user.branchId ? { branchId: user.branchId } : {}),
    ...(status === "active" ? { isActive: true } : status === "inactive" ? { isActive: false } : {}),
    ...(gender === "MALE" || gender === "FEMALE" ? { gender } : {}),
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
  }

  const [total, rows] = await Promise.all([
    prisma.patient.count({ where }),
    prisma.patient
      .findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * perPage,
        take: perPage,
        select: {
          id: true,
          patientNo: true,
          firstName: true,
          middleName: true,
          lastName: true,
          gender: true,
          phone: true,
          city: true,
          isActive: true,
          dateOfBirth: true,
          createdAt: true,
        },
      })
      .then((items) =>
        items.map((p) => ({
          ...p,
          gender: p.gender as "MALE" | "FEMALE",
          dateOfBirth: p.dateOfBirth ? p.dateOfBirth.toISOString() : null,
          createdAt: p.createdAt.toISOString(),
        }))
      ),
  ])

  const totalPages = Math.max(1, Math.ceil(total / perPage))
  const preservedQuery = new URLSearchParams()
  if (q) preservedQuery.set("q", q)
  if (status) preservedQuery.set("status", status)
  if (genderParam) preservedQuery.set("gender", genderParam)
  const preservedQueryString = preservedQuery.toString()

  return (
    <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Patients</h1>
          <p className="text-sm text-muted-foreground">
            {total} patients
          </p>
        </div>
        {user.permissions.includes("patients:create") && (
          <PatientFormDialog
            trigger={
              <Button>
                <UserPlus className="h-4 w-4" />
                New Patient
              </Button>
            }
          />
        )}
      </div>

      <Card className="overflow-hidden">
        <form method="GET" action="/patients" className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Input type="search" name="q" defaultValue={q} placeholder="Search name, ID, phone…" className="w-full" />
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              name="status"
              defaultValue={status}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">All status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <select
              name="gender"
              defaultValue={gender}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">All genders</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
            </select>
            <Button type="submit" variant="outline">
              Filter
            </Button>
            {(q || status || genderParam) && (
              <Button type="button" variant="ghost" asChild>
                <Link href="/patients">Clear</Link>
              </Button>
            )}
          </div>
        </form>

        <PatientsTable rows={rows} />
        <Pagination
          page={page}
          totalPages={totalPages}
          totalItems={total}
          perPage={perPage}
          basePath="/patients"
          preservedQuery={preservedQueryString}
        />
      </Card>
    </div>
  )
}
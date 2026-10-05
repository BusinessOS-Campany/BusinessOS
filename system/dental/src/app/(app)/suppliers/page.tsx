import { requirePermission } from "@/lib/dal"
import { prisma } from "@/lib/prisma"
import { cookies } from "next/headers"
import Link from "next/link"
import { Truck } from "lucide-react"
import { LANG_COOKIE, localeFrom, type Locale } from "@/lib/i18n"
import { SupplierFormDialog, type SupplierLite } from "@/components/suppliers/supplier-form-dialog"
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

export default async function SuppliersPage({ searchParams }: { searchParams?: SearchParams }) {
  const user = await requirePermission("suppliers:view")
  const cookieStore = await cookies()
  const locale: Locale = localeFrom(cookieStore.get(LANG_COOKIE)?.value)
  const ar = locale === "ar"
  const url: Params = (await searchParams) ?? {}

  const q = sp(url, "q")?.trim() ?? ""
  const page = Math.max(1, Number(sp(url, "page")) || 1)

  const where = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { nameAr: { contains: q, mode: "insensitive" as const } },
          { phone: { contains: q, mode: "insensitive" as const } },
          { city: { contains: q, mode: "insensitive" as const } },
          { governorate: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {}

  const [total, rows] = await Promise.all([
    prisma.supplier.count({ where }),
    prisma.supplier.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      include: { _count: { select: { products: true } } },
    }),
  ])

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))
  const preservedQuery = q ? new URLSearchParams({ q }).toString() : ""

  const name = (s: { name: string; nameAr: string | null }) => (ar && s.nameAr ? (s.nameAr as string) : s.name)

  return (
    <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{ar ? "الموردون" : "Suppliers"}</h1>
          <p className="text-sm text-muted-foreground">{total} {ar ? "مورد" : "suppliers"}</p>
        </div>
        {user.permissions.includes("suppliers:create") && (
          <SupplierFormDialog
            trigger={
              <Button>
                <Truck className="h-4 w-4" />
                {ar ? "مورد جديد" : "New Supplier"}
              </Button>
            }
          />
        )}
      </div>

      <Card className="overflow-hidden">
        <form method="GET" action="/suppliers" className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <Input type="search" name="q" defaultValue={q} placeholder={ar ? "بحث بالاسم أو الهاتف…" : "Search name or phone…"} className="w-full" />
          </div>
          <Button type="submit" variant="outline">{ar ? "تصفية" : "Filter"}</Button>
          {q && (
            <Button type="button" variant="ghost" asChild>
              <Link href="/suppliers">{ar ? "مسح" : "Clear"}</Link>
            </Button>
          )}
        </form>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{ar ? "الاسم" : "Name"}</TableHead>
                <TableHead>{ar ? "التواصل" : "Contact"}</TableHead>
                <TableHead>{ar ? "المحافظة / المدينة" : "Governorate / City"}</TableHead>
                <TableHead className="text-end">{ar ? "المنتجات" : "Products"}</TableHead>
                {user.permissions.includes("suppliers:edit") && (
                  <TableHead className="text-end">{ar ? "إجراءات" : "Actions"}</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-16 text-center text-sm text-muted-foreground">{ar ? "لا يوجد موردون" : "No suppliers found"}</TableCell>
                </TableRow>
              ) : (
                rows.map((s) => {
                  const lite: SupplierLite = {
                    id: s.id,
                    name: s.name,
                    nameAr: s.nameAr,
                    phone: s.phone,
                    email: s.email,
                    address: s.address,
                    governorate: s.governorate,
                    city: s.city,
                  }
                  return (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="font-medium">{name(s)}</div>
                        {s.address && <div className="text-xs text-muted-foreground">{s.address}</div>}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{s.phone ?? "—"}</div>
                        {s.email && <div className="text-xs text-muted-foreground" dir="ltr">{s.email}</div>}
                      </TableCell>
                      <TableCell className="text-sm">
                        {[s.governorate, s.city].filter(Boolean).join("، ") || "—"}
                      </TableCell>
                      <TableCell className="text-end tabular-nums">{s._count.products}</TableCell>
                      {user.permissions.includes("suppliers:edit") && (
                        <TableCell className="text-end">
                          <SupplierFormDialog existing={lite} trigger={<Button variant="outline" size="sm">{ar ? "تعديل" : "Edit"}</Button>} />
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

        <Pagination page={page} totalPages={totalPages} totalItems={total} perPage={PER_PAGE} basePath="/suppliers" preservedQuery={preservedQuery} />
      </Card>
    </div>
  )
}
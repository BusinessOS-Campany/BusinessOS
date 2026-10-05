import { requirePermission } from "@/lib/dal"
import { prisma } from "@/lib/prisma"
import { cookies } from "next/headers"
import Link from "next/link"
import { Package, ArrowLeftRight } from "lucide-react"
import { LANG_COOKIE, localeFrom, type Locale } from "@/lib/i18n"
import { statusColor } from "@/lib/status-ui"
import { formatCurrency, formatDate } from "@/lib/format"
import { PRODUCT_CATEGORIES, productCategoryLabel, productUnitLabel } from "@/lib/constants/inventory"
import { ProductFormDialog, type ProductLite, type SupplierOption } from "@/components/inventory/product-form-dialog"
import { StockAdjustDialog } from "@/components/inventory/stock-adjust-dialog"
import { DeleteProductButton } from "@/components/inventory/delete-product-button"
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
const isCategory = (v: string): v is (typeof PRODUCT_CATEGORIES)[number] =>
  PRODUCT_CATEGORIES.includes(v as (typeof PRODUCT_CATEGORIES)[number])

const dec = (v: string | { toString(): string }) => Number(v.toString())

export default async function InventoryPage({ searchParams }: { searchParams?: SearchParams }) {
  const user = await requirePermission("inventory:view")
  const cookieStore = await cookies()
  const locale: Locale = localeFrom(cookieStore.get(LANG_COOKIE)?.value)
  const ar = locale === "ar"
  const url: Params = (await searchParams) ?? {}
  const today = new Date()

  const q = sp(url, "q")?.trim() ?? ""
  const category = sp(url, "category") ?? ""
  const page = Math.max(1, Number(sp(url, "page")) || 1)

  const where = {
    ...(user.branchId ? { branchId: user.branchId } : {}),
    ...(category && isCategory(category) ? { category } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { nameAr: { contains: q, mode: "insensitive" as const } },
            { sku: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  }

  const [total, rows, suppliers, lowCount] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      include: { supplier: { select: { id: true, name: true, nameAr: true } } },
    }),
    prisma.supplier.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, nameAr: true },
    }),
    prisma.product.count({
      where: {
        ...(user.branchId ? { branchId: user.branchId } : {}),
        quantity: { lte: prisma.product.fields.minStock },
      },
    }),
  ])

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))
  const preserved = new URLSearchParams()
  if (q) preserved.set("q", q)
  if (category) preserved.set("category", category)
  const preservedQuery = preserved.toString()

  const supplierOptions: SupplierOption[] = suppliers.map((s) => ({
    id: s.id,
    label: ar && s.nameAr ? (s.nameAr as string) : s.name,
  }))
  const supplierName = (s: { name: string; nameAr: string | null } | null) =>
    s ? (ar && s.nameAr ? s.nameAr : s.name) : "—"

  return (
    <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{ar ? "المخزون" : "Inventory"}</h1>
          <p className="text-sm text-muted-foreground">
            {total} {ar ? "صنف" : "products"}
            {lowCount > 0 && (
              <span className="ms-2 inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {lowCount} {ar ? "صنف منخفض المخزون" : "low stock items"}
              </span>
            )}
          </p>
        </div>
        {user.permissions.includes("inventory:create") && (
          <ProductFormDialog
            trigger={
              <Button>
                <Package className="h-4 w-4" />
                {ar ? "منتج جديد" : "New Product"}
              </Button>
            }
            suppliers={supplierOptions}
          />
        )}
      </div>

      <Card className="overflow-hidden">
        <form method="GET" action="/inventory" className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <Input type="search" name="q" defaultValue={q} placeholder={ar ? "بحث بالاسم أو الرمز…" : "Search name or SKU…"} className="w-full" />
          </div>
          <select
            name="category"
            defaultValue={category}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">{ar ? "كل الفئات" : "All categories"}</option>
            {PRODUCT_CATEGORIES.map((c) => (
              <option key={c} value={c}>{productCategoryLabel(c, locale)}</option>
            ))}
          </select>
          <Button type="submit" variant="outline">{ar ? "تصفية" : "Filter"}</Button>
          {(q || category) && (
            <Button type="button" variant="ghost" asChild>
              <Link href="/inventory">{ar ? "مسح" : "Clear"}</Link>
            </Button>
          )}
        </form>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{ar ? "الصنف" : "Product"}</TableHead>
                <TableHead>{ar ? "الرمز" : "SKU"}</TableHead>
                <TableHead>{ar ? "الفئة" : "Category"}</TableHead>
                <TableHead>{ar ? "المورد" : "Supplier"}</TableHead>
                <TableHead className="text-end">{ar ? "الكمية" : "Quantity"}</TableHead>
                <TableHead className="text-end">{ar ? "التكلفة" : "Cost"}</TableHead>
                <TableHead className="text-end">{ar ? "سعر البيع" : "Selling price"}</TableHead>
                <TableHead>{ar ? "الانتهاء" : "Expiration"}</TableHead>
                {(user.permissions.includes("inventory:edit") || user.permissions.includes("inventory:delete")) && (
                  <TableHead className="text-end">{ar ? "إجراءات" : "Actions"}</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-16 text-center text-sm text-muted-foreground">{ar ? "لا توجد منتجات" : "No products found"}</TableCell>
                </TableRow>
              ) : (
                rows.map((p) => {
                  const lite: ProductLite = {
                    id: p.id,
                    name: p.name,
                    nameAr: p.nameAr,
                    sku: p.sku,
                    category: p.category ?? "OTHER",
                    supplierId: p.supplierId,
                    batch: p.batch,
                    expirationDate: p.expirationDate ? p.expirationDate.toISOString() : null,
                    quantity: String(p.quantity),
                    minStock: String(p.minStock),
                    cost: String(p.cost),
                    sellingPrice: String(p.sellingPrice),
                    unit: p.unit,
                    location: p.location,
                  }
                  const qty = dec(String(p.quantity))
                  const min = dec(String(p.minStock))
                  const low = min > 0 && qty <= min
                  const unit = productUnitLabel(p.unit, locale)
                  const expired = p.expirationDate ? p.expirationDate.getTime() <= today.getTime() : false
                  const catColor = statusColor(p.category ?? "OTHER")
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="font-medium">{p.name}</div>
                        {p.nameAr && <div className="text-xs text-muted-foreground" dir="rtl">{p.nameAr}</div>}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                      <TableCell>
                        <span
                          className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs"
                          style={{ borderColor: catColor.border, color: catColor.text, background: catColor.bg }}
                        >
                          {productCategoryLabel(p.category ?? "OTHER", locale)}
                        </span>
                      </TableCell>

                      <TableCell>{supplierName(p.supplier)}</TableCell>
                      <TableCell className="text-end tabular-nums">
                        <span className={low ? "font-semibold text-destructive" : ""}>
                          {qty} <span className="text-xs text-muted-foreground">{unit}</span>
                        </span>
                        {low && (
                          <div>
                            <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                              {ar ? "مخزون منخفض" : "Low stock"}
                            </span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-end tabular-nums">{formatCurrency(p.cost)}</TableCell>
                      <TableCell className="text-end tabular-nums">{formatCurrency(p.sellingPrice)}</TableCell>
                      <TableCell>
                        {p.expirationDate ? (
                          <span style={expired ? { color: statusColor("LOW_INVENTORY").text } : undefined}>{formatDate(p.expirationDate, locale)}</span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      {(user.permissions.includes("inventory:edit") || user.permissions.includes("inventory:delete")) && (
                        <TableCell className="text-end">
                          <div className="flex items-center justify-end gap-2">
                            {user.permissions.includes("inventory:edit") && (
                              <StockAdjustDialog
                                trigger={
                                  <Button variant="outline" size="sm">
                                    <ArrowLeftRight className="h-3.5 w-3.5" />
                                    {ar ? "تسوية" : "Adjust"}
                                  </Button>
                                }
                                productId={p.id}
                                productName={ar && p.nameAr ? (p.nameAr as string) : p.name}
                                currentQuantity={`${qty} ${unit}`}
                              />
                            )}
                            {user.permissions.includes("inventory:edit") && (
                              <ProductFormDialog existing={lite} suppliers={supplierOptions} trigger={<Button variant="outline" size="sm">{ar ? "تعديل" : "Edit"}</Button>} />
                            )}
                            {user.permissions.includes("inventory:delete") && <DeleteProductButton productId={p.id} />}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

        <Pagination page={page} totalPages={totalPages} totalItems={total} perPage={PER_PAGE} basePath="/inventory" preservedQuery={preservedQuery} />
      </Card>
    </div>
  )
}
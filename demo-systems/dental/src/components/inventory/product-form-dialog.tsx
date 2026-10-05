"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useI18n } from "@/components/lang-provider"
import { createProductAction, updateProductAction, type ProductFormState } from "@/lib/actions/inventory"
import { PRODUCT_CATEGORIES, PRODUCT_UNITS, productCategoryLabel, productUnitLabel } from "@/lib/constants/inventory"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PackagePlus } from "lucide-react"

export interface ProductLite {
  id: string
  name: string
  nameAr: string | null
  sku: string
  category: string
  supplierId: string | null
  batch: string | null
  expirationDate: string | null
  quantity: string
  minStock: string
  cost: string
  sellingPrice: string
  unit: string
  location: string | null
}

export interface SupplierOption {
  id: string
  label: string
}

interface Props {
  trigger?: React.ReactNode
  existing?: ProductLite | null
  suppliers?: SupplierOption[]
}

export function ProductFormDialog({ trigger, existing = null, suppliers = [] }: Props) {
  const { t, locale } = useI18n()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [category, setCategory] = useState(existing?.category || "OTHER")
  const [unit, setUnit] = useState(existing?.unit || "pcs")
  const [supplierId, setSupplierId] = useState(existing?.supplierId ?? "")
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const ar = locale === "ar"

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const sku = (new FormData(e.currentTarget).get("sku") as string)?.trim()
    if (!sku) {
      setError(ar ? "رمز الصنف مطلوب" : "SKU is required")
      return
    }
    startTransition(async () => {
      const fd = new FormData(e.currentTarget)
      const res: ProductFormState = existing
        ? await updateProductAction({}, fd)
        : await createProductAction({}, fd)
      if (res.ok) {
        router.refresh()
        setOpen(false)
      } else if (res.error === "duplicate") {
        setError(ar ? "رمز الصنف مستخدم بالفعل لهذا الفرع" : "This SKU already exists for the branch")
      } else {
        setError(ar ? "حدث خطأ أثناء الحفظ" : t.common.error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={onSubmit} className="grid gap-4 py-2">
          <DialogHeader>
            <DialogTitle>{existing ? t.inventory.editProduct : t.inventory.newProduct}</DialogTitle>
            <DialogDescription>{ar ? "بيانات الصنف ومستوى المخزون" : "Product details and stock level"}</DialogDescription>
          </DialogHeader>

          {existing && <input type="hidden" name="id" value={existing.id} />}
          <input type="hidden" name="category" value={category} />
          <input type="hidden" name="unit" value={unit} />
          <input type="hidden" name="supplierId" value={supplierId} />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t.inventory.name} *</Label>
              <Input name="name" defaultValue={existing?.name ?? ""} required />
            </div>
            <div className="space-y-1.5">
              <Label>{t.inventory.nameAr}</Label>
              <Input name="nameAr" defaultValue={existing?.nameAr ?? ""} dir="rtl" />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t.inventory.sku} *</Label>
              <Input name="sku" defaultValue={existing?.sku ?? ""} required />
            </div>
            <div className="space-y-1.5">
              <Label>{t.inventory.category}</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRODUCT_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {productCategoryLabel(c, locale)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t.inventory.supplier}</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={ar ? "بدون مورد" : "No supplier"} />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t.inventory.unit}</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRODUCT_UNITS.map((u) => (
                    <SelectItem key={u.value} value={u.value}>
                      {productUnitLabel(u.value, locale)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>{t.inventory.quantity}</Label>
              <Input name="quantity" type="number" min="0" step="0.01" inputMode="decimal" defaultValue={existing?.quantity ?? "0"} />
            </div>
            <div className="space-y-1.5">
              <Label>{t.inventory.minStock}</Label>
              <Input name="minStock" type="number" min="0" step="0.01" inputMode="decimal" defaultValue={existing?.minStock ?? "0"} />
            </div>
            <div className="space-y-1.5">
              <Label>{t.inventory.batch}</Label>
              <Input name="batch" defaultValue={existing?.batch ?? ""} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>{t.inventory.cost}</Label>
              <Input name="cost" type="number" min="0" step="0.01" inputMode="decimal" defaultValue={existing?.cost ?? "0"} />
            </div>
            <div className="space-y-1.5">
              <Label>{t.inventory.sellingPrice}</Label>
              <Input name="sellingPrice" type="number" min="0" step="0.01" inputMode="decimal" defaultValue={existing?.sellingPrice ?? "0"} />
            </div>
            <div className="space-y-1.5">
              <Label>{t.inventory.expiration}</Label>
              <Input name="expirationDate" type="date" defaultValue={(existing?.expirationDate ?? "").slice(0, 10)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t.inventory.location}</Label>
            <Input name="location" defaultValue={existing?.location ?? ""} placeholder={ar ? "رف / خزانة…" : "Shelf / cabinet…"} />
          </div>

          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={isPending}>
              <PackagePlus className="h-4 w-4" />
              {isPending ? t.common.loading : existing ? t.common.update : t.common.create}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
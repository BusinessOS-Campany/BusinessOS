"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useI18n } from "@/components/lang-provider"
import { adjustStockAction, type ProductFormState } from "@/lib/actions/inventory"
import { stockMovementLabel } from "@/lib/constants/inventory"
import { STOCK_MOVEMENT_TYPES } from "@/lib/constants/clinical"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
import { ArrowLeftRight } from "lucide-react"

interface Props {
  trigger?: React.ReactNode
  productId: string
  productName: string
  currentQuantity: string
}

export function StockAdjustDialog({ trigger, productId, productName, currentQuantity }: Props) {
  const { t, locale } = useI18n()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [type, setType] = useState("STOCK_IN")
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const ar = locale === "ar"

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const fd = new FormData(e.currentTarget)
      const res: ProductFormState = await adjustStockAction({}, fd)
      if (res.ok) {
        router.refresh()
        setOpen(false)
      } else {
        setError(ar ? "تعذر تنفيذ حركة المخزون (تحقق من الكمية)" : "Could not record movement (check quantity)")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} className="grid gap-4 py-2">
          <DialogHeader>
            <DialogTitle>{t.inventory.adjustStock}</DialogTitle>
            <DialogDescription>
              {ar ? `${productName} — المخزون الحالي: ${currentQuantity}` : `${productName} — Current stock: ${currentQuantity}`}
            </DialogDescription>
          </DialogHeader>

          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="type" value={type} />

          <div className="space-y-1.5">
            <Label>{t.inventory.movementType} *</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STOCK_MOVEMENT_TYPES.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {stockMovementLabel(m.value, locale)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t.inventory.quantity} *</Label>
            <Input name="quantity" type="number" min="0.01" step="0.01" inputMode="decimal" required placeholder="0" />
          </div>

          <div className="space-y-1.5">
            <Label>{t.inventory.notes}</Label>
            <Textarea name="notes" rows={2} placeholder={ar ? "ملاحظات الحركة…" : "Movement notes…"} />
          </div>

          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={isPending}>
              <ArrowLeftRight className="h-4 w-4" />
              {isPending ? t.common.loading : t.common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
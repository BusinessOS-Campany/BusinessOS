"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useI18n } from "@/components/lang-provider"
import { createSupplierAction, updateSupplierAction, type SupplierFormState } from "@/lib/actions/suppliers"
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
import { Truck } from "lucide-react"

export interface SupplierLite {
  id: string
  name: string
  nameAr: string | null
  phone: string | null
  email: string | null
  address: string | null
  governorate: string | null
  city: string | null
}

interface Props {
  trigger?: React.ReactNode
  existing?: SupplierLite | null
}

export function SupplierFormDialog({ trigger, existing = null }: Props) {
  const { t, locale } = useI18n()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const ar = locale === "ar"

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const fd = new FormData(e.currentTarget)
      const res: SupplierFormState = existing
        ? await updateSupplierAction({}, fd)
        : await createSupplierAction({}, fd)
      if (res.ok) {
        router.refresh()
        setOpen(false)
      } else {
        setError(ar ? "حدث خطأ أثناء الحفظ" : t.common.error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} className="grid gap-4 py-2">
          <DialogHeader>
            <DialogTitle>{existing ? t.suppliers.editSupplier : t.suppliers.newSupplier}</DialogTitle>
            <DialogDescription>{ar ? "بيانات مورد المواد والمعدات" : "Supplier contact details"}</DialogDescription>
          </DialogHeader>

          {existing && <input type="hidden" name="id" value={existing.id} />}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t.suppliers.name} *</Label>
              <Input name="name" defaultValue={existing?.name ?? ""} required />
            </div>
            <div className="space-y-1.5">
              <Label>{t.suppliers.nameAr}</Label>
              <Input name="nameAr" defaultValue={existing?.nameAr ?? ""} dir="rtl" />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t.suppliers.phone}</Label>
              <Input name="phone" dir="ltr" defaultValue={existing?.phone ?? ""} placeholder="+967 7XX XXX XXX" />
            </div>
            <div className="space-y-1.5">
              <Label>{t.suppliers.email}</Label>
              <Input name="email" type="email" dir="ltr" defaultValue={existing?.email ?? ""} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t.suppliers.governorate}</Label>
              <Input name="governorate" defaultValue={existing?.governorate ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label>{t.suppliers.city}</Label>
              <Input name="city" defaultValue={existing?.city ?? ""} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t.suppliers.address}</Label>
            <Input name="address" defaultValue={existing?.address ?? ""} />
          </div>

          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={isPending}>
              <Truck className="h-4 w-4" />
              {isPending ? t.common.loading : existing ? t.common.update : t.common.create}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
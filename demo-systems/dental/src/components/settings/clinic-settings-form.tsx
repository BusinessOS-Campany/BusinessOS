"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useI18n } from "@/components/lang-provider"
import { updateClinicAction, type SettingsFormState } from "@/lib/actions/settings"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Save } from "lucide-react"

export interface ClinicSettings {
  name: string
  nameAr: string | null
  phone: string | null
  email: string | null
  website: string | null
  address: string | null
  governorate: string | null
  city: string | null
  currency: string
  taxRate: string
  invoicePrefix: string
}

export function ClinicSettingsForm({ initial }: { initial: ClinicSettings }) {
  const { t, locale } = useI18n()
  const ar = locale === "ar"
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const fd = new FormData(e.currentTarget)
      const res: SettingsFormState = await updateClinicAction({}, fd)
      if (res.ok) {
        router.refresh()
        setSaved(true)
      } else {
        setError(ar ? "حدث خطأ أثناء الحفظ" : t.common.error)
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <CardHeader>
        <CardTitle className="text-base">{t.settings.clinicInfo}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t.settings.name} *</Label>
            <Input name="name" defaultValue={initial.name} required maxLength={160} />
          </div>
          <div className="space-y-1.5">
            <Label>{t.settings.nameAr}</Label>
            <Input name="nameAr" defaultValue={initial.nameAr ?? ""} maxLength={160} />
          </div>
          <div className="space-y-1.5">
            <Label>{t.settings.phone}</Label>
            <Input name="phone" dir="ltr" defaultValue={initial.phone ?? ""} maxLength={30} />
          </div>
          <div className="space-y-1.5">
            <Label>{t.settings.email}</Label>
            <Input name="email" type="email" dir="ltr" defaultValue={initial.email ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label>{t.settings.website}</Label>
            <Input name="website" dir="ltr" defaultValue={initial.website ?? ""} maxLength={160} />
          </div>
          <div className="space-y-1.5">
            <Label>{t.settings.currency}</Label>
            <Input name="currency" dir="ltr" defaultValue={initial.currency} maxLength={12} />
          </div>
          <div className="space-y-1.5">
            <Label>{t.settings.governorate}</Label>
            <Input name="governorate" defaultValue={initial.governorate ?? ""} maxLength={80} />
          </div>
          <div className="space-y-1.5">
            <Label>{t.settings.city}</Label>
            <Input name="city" defaultValue={initial.city ?? ""} maxLength={80} />
          </div>
          <div className="space-y-1.5">
            <Label>{t.settings.address}</Label>
            <Input name="address" defaultValue={initial.address ?? ""} maxLength={240} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t.settings.taxRate}</Label>
              <Input name="taxRate" type="number" min="0" max="100" step="0.01" inputMode="decimal" dir="ltr" defaultValue={initial.taxRate} />
            </div>
            <div className="space-y-1.5">
              <Label>{t.settings.invoicePrefix}</Label>
              <Input name="invoicePrefix" dir="ltr" defaultValue={initial.invoicePrefix} maxLength={12} />
            </div>
          </div>
        </div>

        {saved && (
          <p className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">{t.settings.saved}</p>
        )}
        {error && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={isPending}>
            <Save className="h-4 w-4" />
            {isPending ? t.common.loading : t.settings.save}
          </Button>
        </div>
      </CardContent>
    </form>
  )
}
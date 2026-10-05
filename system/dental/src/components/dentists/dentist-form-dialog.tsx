"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useI18n } from "@/components/lang-provider"
import { createDentistAction, updateDentistAction, type DentistFormState } from "@/lib/actions/dentists"
import { SPECIALTIES, WORKING_DAYS } from "@/lib/constants/admin"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
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
import { Stethoscope } from "lucide-react"

export interface DentistLite {
  id: string
  userId: string
  userLabel: string
  specialty: string | null
  licenseNumber: string | null
  workingDays: string[]
  isActive: boolean
}

export interface UserOption {
  id: string
  label: string
}

interface Props {
  trigger?: React.ReactNode
  existing?: DentistLite | null
  users: UserOption[]
}

export function DentistFormDialog({ trigger, existing = null, users }: Props) {
  const { t, locale } = useI18n()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [userId, setUserId] = useState(existing?.userId ?? "")
  const [specialty, setSpecialty] = useState(existing?.specialty ?? "GENERAL")
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const ar = locale === "ar"

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!userId) {
      setError(ar ? "اختر حساب المستخدم" : "Select a user account")
      return
    }
    setError(null)
    startTransition(async () => {
      const fd = new FormData(e.currentTarget)
      const res: DentistFormState = existing
        ? await updateDentistAction({}, fd)
        : await createDentistAction({}, fd)
      if (res.ok) {
        router.refresh()
        setOpen(false)
      } else {
        const msg =
          res.error === "taken"
            ? ar ? "هذا الحساب مسجل كطبيب بالفعل" : "This account is already a dentist"
            : (ar ? "حدث خطأ أثناء الحفظ" : t.common.error)
        setError(msg)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={onSubmit} className="grid gap-4 py-2">
          <DialogHeader>
            <DialogTitle>{existing ? t.dentists.editDentist : t.dentists.newDentist}</DialogTitle>
            <DialogDescription>
              {ar ? "معلومات الطبيب وأيام العمل" : "Dentist details and working days"}
            </DialogDescription>
          </DialogHeader>

          {existing && <input type="hidden" name="id" value={existing.id} />}

          <div className="space-y-1.5">
            <Label>{t.dentists.user} *</Label>
            {existing ? (
              <Input value={existing.userLabel} disabled />
            ) : (
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t.dentists.selectUser} />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <input type="hidden" name="userId" value={userId} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t.dentists.specialty}</Label>
              <Select value={specialty} onValueChange={setSpecialty}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SPECIALTIES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {ar ? s.ar : s.en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="specialty" value={specialty} />
            </div>
            <div className="space-y-1.5">
              <Label>{t.dentists.license}</Label>
              <Input name="licenseNumber" dir="ltr" defaultValue={existing?.licenseNumber ?? ""} maxLength={80} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t.dentists.workingDays}</Label>
            <div className="flex flex-wrap gap-3 py-1">
              {WORKING_DAYS.map((d) => {
                const checked = existing?.workingDays.includes(d.value) ?? false
                return (
                  <label key={d.value} className="flex items-center gap-1.5 text-sm">
                    <Checkbox name="workingDays" value={d.value} defaultChecked={checked} />
                    {ar ? d.ar : d.en}
                  </label>
                )
              })}
            </div>
          </div>

          {existing && (
            <label className="flex items-center gap-2 pb-1">
              <Checkbox name="isActive" defaultChecked={existing.isActive} />
              <span className="text-sm">{existing.isActive ? t.dentists.active : t.dentists.inactive}</span>
            </label>
          )}

          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={isPending || (!existing && users.length === 0)}>
              <Stethoscope className="h-4 w-4" />
              {isPending ? t.common.loading : existing ? t.common.update : t.common.create}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
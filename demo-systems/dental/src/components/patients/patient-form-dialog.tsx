"use client"

import { useActionState, useState } from "react"
import { useI18n } from "@/components/lang-provider"
import { createPatientAction, updatePatientAction, type PatientFormState } from "@/lib/actions/patients"
import { GOVERNORATES } from "@/lib/constants/yemen"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export interface PatientFormValues {
  firstName: string
  middleName: string
  lastName: string
  gender: "MALE" | "FEMALE" | ""
  dateOfBirth: string
  phone: string
  whatsapp: string
  governorate: string
  city: string
}

interface PatientFormDialogProps {
  mode?: "create" | "edit"
  patientId?: string
  initial?: Partial<PatientFormValues> | null
  trigger?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function PatientFormDialog({
  mode = "create",
  patientId,
  initial,
  trigger,
  open,
  onOpenChange,
}: PatientFormDialogProps) {
  const { t, locale } = useI18n()
  const isEdit = mode === "edit"

  const boundAction = isEdit
    ? (prev: PatientFormState, fd: FormData) => updatePatientAction(patientId!, prev, fd)
    : createPatientAction

  const [state, formAction, isPending] = useActionState<PatientFormState, FormData>(
    boundAction,
    {}
  )
  const [gender, setGender] = useState<string>(initial?.gender ?? "")
  const [governorate, setGovernorate] = useState<string>(initial?.governorate ?? "")
  const [internalOpen, setInternalOpen] = useState(false)

  const isControlled = open !== undefined
  const dialogOpen = isControlled ? open : internalOpen
  const setOpen = (v: boolean) => {
    setInternalOpen(v)
    onOpenChange?.(v)
  }

  const fieldError = (key: string) => {
    const errors = state.fieldErrors?.[key]
    return errors?.length ? errors[0] : undefined
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger ?? <span className="hidden" />}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form action={formAction} className="grid gap-4 py-2">
          <DialogHeader>
            <DialogTitle>{isEdit ? t.common.edit : t.patients.newPatient}</DialogTitle>
            <DialogDescription>
              {isEdit
                ? t.common.update
                : locale === "ar"
                ? "أدخل بيانات المريض الجديد"
                : "Enter new patient details"}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pf-firstName">{t.patients.firstName} *</Label>
                <Input
                  id="pf-firstName"
                  name="firstName"
                  defaultValue={initial?.firstName}
                  placeholder="…"
                  aria-invalid={!!fieldError("firstName")}
                />
                {fieldError("firstName") && <p className="text-xs text-destructive">{t.common.required}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pf-middleName">{t.patients.middleName}</Label>
                <Input id="pf-middleName" name="middleName" defaultValue={initial?.middleName} placeholder="…" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pf-lastName">{t.patients.lastName} *</Label>
                <Input
                  id="pf-lastName"
                  name="lastName"
                  defaultValue={initial?.lastName}
                  placeholder="…"
                  aria-invalid={!!fieldError("lastName")}
                />
                {fieldError("lastName") && <p className="text-xs text-destructive">{t.common.required}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>{t.patients.gender} *</Label>
                <Select value={gender} onValueChange={setGender}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t.common.select} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MALE">{locale === "ar" ? "ذكر" : "Male"}</SelectItem>
                    <SelectItem value="FEMALE">{locale === "ar" ? "أنثى" : "Female"}</SelectItem>
                  </SelectContent>
                </Select>
                <input type="hidden" name="gender" value={gender} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pf-dob">{t.patients.dateOfBirth}</Label>
                <Input id="pf-dob" name="dateOfBirth" type="date" defaultValue={initial?.dateOfBirth} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pf-phone">{t.patients.phone}</Label>
                <Input id="pf-phone" name="phone" type="tel" defaultValue={initial?.phone} dir="ltr" placeholder="7XXXXXXXX" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pf-whatsapp">{t.patients.whatsapp}</Label>
                <Input id="pf-whatsapp" name="whatsapp" type="tel" defaultValue={initial?.whatsapp} dir="ltr" placeholder="7XXXXXXXX" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pf-city">{t.patients.city}</Label>
                <Input id="pf-city" name="city" defaultValue={initial?.city} placeholder="…" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{t.patients.governorate}</Label>
              <Select value={governorate} onValueChange={setGovernorate}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t.common.select} />
                </SelectTrigger>
                <SelectContent>
                  {GOVERNORATES.map((g) => (
                    <SelectItem key={g.en} value={g.en}>
                      {locale === "ar" ? g.ar : g.en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="governorate" value={governorate} />
            </div>
          </div>

          {state?.error && state.error !== "invalid" && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {t.common.error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? t.common.loading : isEdit ? t.common.update : t.patients.newPatient}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
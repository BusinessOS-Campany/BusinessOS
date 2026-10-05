"use client"

import { useActionState, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useI18n } from "@/components/lang-provider"
import { createAppointmentAction, type AppointmentFormState } from "@/lib/actions/appointments"
import { APPOINTMENT_TYPES } from "@/lib/constants/clinical"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export interface AppointmentDialogOptions {
  patients: { id: string; label: string }[]
  dentists: { id: string; label: string }[]
  chairs: { id: string; label: string }[]
}

interface Props {
  trigger?: React.ReactNode
  defaultDate?: string
  options: AppointmentDialogOptions
}

export function AppointmentFormDialog({ trigger, defaultDate, options }: Props) {
  const { t, locale } = useI18n()
  const [state, formAction, isPending] = useActionState<AppointmentFormState, FormData>(
    createAppointmentAction,
    {}
  )
  const [open, setOpen] = useState(false)
  const router = useRouter()

  useEffect(() => {
    if (state.ok && state.date) {
      router.push(`/appointments?date=${state.date}`)
      router.refresh()
    }
  }, [state, router])
  const [patientId, setPatientId] = useState("")
  const [dentistId, setDentistId] = useState("")
  const [chairId, setChairId] = useState("")
  const [type, setType] = useState("")

  const hidden = [
    ["patientId", patientId],
    ["dentistId", dentistId],
    ["chairId", chairId],
    ["type", type],
  ] as const

  const errText = (key: string) => {
    const e = state.fieldErrors?.[key]
    return e?.length ? e[0] : undefined
  }

  return (
    <Dialog open={open && !state.ok} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form action={formAction} className="grid gap-4 py-2">
          <DialogHeader>
            <DialogTitle>{t.appointments.newAppointment}</DialogTitle>
            <DialogDescription>
              {locale === "ar" ? "حدد المريض والطبيب والتوقيت" : "Select patient, dentist and timing"}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            {hidden.map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}

            <div className="space-y-1.5">
              <Label>{t.patients.fullName} *</Label>
              <Select value={patientId} onValueChange={setPatientId} required>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t.common.select} />
                </SelectTrigger>
                <SelectContent>
                  {options.patients.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errText("patientId") && <p className="text-xs text-destructive">{t.common.required}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t.appointments.dentist}</Label>
                <Select value={dentistId} onValueChange={setDentistId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t.common.select} />
                  </SelectTrigger>
                  <SelectContent>
                    {options.dentists.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t.appointments.type} *</Label>
                <Select value={type} onValueChange={setType} required>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t.common.select} />
                  </SelectTrigger>
                  <SelectContent>
                    {APPOINTMENT_TYPES.map((at) => (
                      <SelectItem key={at.value} value={at.value}>
                        {locale === "ar" ? at.ar : at.en}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errText("type") && <p className="text-xs text-destructive">{t.common.required}</p>}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{t.appointments.chair}</Label>
              <Select value={chairId} onValueChange={setChairId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t.common.select} />
                </SelectTrigger>
                <SelectContent>
                  {options.chairs.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ap-date">{t.appointments.date} *</Label>
              <Input id="ap-date" name="date" type="date" required defaultValue={defaultDate} />
              {errText("date") && <p className="text-xs text-destructive">{t.common.required}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ap-start">{t.appointments.startTime} *</Label>
                <Input id="ap-start" name="startTime" type="time" required defaultValue="09:00" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ap-end">{t.appointments.endTime} *</Label>
                <Input id="ap-end" name="endTime" type="time" required defaultValue="09:30" />
              </div>
            </div>

            {errText("endTime") && (
              <p className="text-xs text-destructive">
                {errText("endTime") === "END_BEFORE_START"
                  ? locale === "ar"
                    ? "وقت الانتهاء يجب أن يكون بعد وقت البدء"
                    : "End time must be after start time"
                  : t.common.required}
              </p>
            )}

            {state.error === "conflict" && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {locale === "ar"
                  ? "هذا الكرسي محجوز في هذا التوقيت"
                  : "This chair is already booked for that time slot"}
              </p>
            )}
            {state.error && state.error !== "invalid" && state.error !== "conflict" && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {t.common.error}
              </p>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="ap-notes">{t.appointments.notes}</Label>
              <Textarea id="ap-notes" name="notes" rows={2} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? t.common.loading : t.common.create}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
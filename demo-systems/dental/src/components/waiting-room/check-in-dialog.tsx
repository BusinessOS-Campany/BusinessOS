"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useI18n } from "@/components/lang-provider"
import { checkInWaitingAction, type CheckInState } from "@/lib/actions/waiting-room"
import { SEVERITIES } from "@/lib/constants/clinical"
import { Button } from "@/components/ui/button"
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

export interface WaitingRoomOptions {
  patients: { id: string; label: string }[]
  dentists: { id: string; label: string }[]
  chairs: { id: string; label: string }[]
  appointments: { id: string; label: string }[]
}

interface Props {
  trigger?: React.ReactNode
  options: WaitingRoomOptions
}

export function CheckInDialog({ trigger, options }: Props) {
  const { t, locale } = useI18n()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [patientId, setPatientId] = useState("")
  const [appointmentId, setAppointmentId] = useState("")
  const [dentistId, setDentistId] = useState("")
  const [chairId, setChairId] = useState("")
  const [priority, setPriority] = useState("")

  const hidden = [
    ["patientId", patientId],
    ["appointmentId", appointmentId],
    ["dentistId", dentistId],
    ["chairId", chairId],
    ["priority", priority],
  ] as const

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!patientId) {
      setError(locale === "ar" ? "حدد المريض أولاً" : t.common.required)
      return
    }
    const formData = new FormData(e.currentTarget)
    setError(null)
    startTransition(async () => {
      const res: CheckInState = await checkInWaitingAction({}, formData)
      if (res.ok) {
        router.refresh()
        setOpen(false)
        setPatientId("")
        setAppointmentId("")
        setDentistId("")
        setChairId("")
        setPriority("")
      } else if (res.error === "duplicate") {
        setError(locale === "ar" ? "هذا المريض موجود بالفعل في قائمة الانتظار" : "This patient is already in the waiting queue")
      } else {
        setError(locale === "ar" ? "حدث خطأ أثناء الحفظ" : t.common.error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={onSubmit} className="grid gap-4 py-2">
          <DialogHeader>
            <DialogTitle>{t.waitingRoom.checkIn}</DialogTitle>
            <DialogDescription>
              {locale === "ar" ? "تسجيل دخول المريض إلى قائمة الانتظار" : "Add a patient to the waiting queue"}
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
            </div>

            <div className="space-y-1.5">
              <Label>{t.waitingRoom.fromAppointment}</Label>
              <Select value={appointmentId} onValueChange={setAppointmentId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t.waitingRoom.walkIn} />
                </SelectTrigger>
                <SelectContent>
                  {options.appointments.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t.waitingRoom.dentist}</Label>
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
                <Label>{t.waitingRoom.chair}</Label>
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
            </div>

            <div className="space-y-1.5">
              <Label>{t.waitingRoom.priority}</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t.common.select} />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITIES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {locale === "ar" ? s.ar : s.en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wr-notes">{t.waitingRoom.notes}</Label>
              <Textarea id="wr-notes" name="notes" rows={2} />
            </div>

            {error === null ? null : (
                <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}
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
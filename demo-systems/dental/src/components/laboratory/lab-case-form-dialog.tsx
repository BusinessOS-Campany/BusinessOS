"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useI18n } from "@/components/lang-provider"
import { createLabCaseAction, updateLabCaseAction, type LabCaseFormState } from "@/lib/actions/laboratory"
import { LAB_CASE_STATUSES, labStatusLabel } from "@/lib/constants/inventory"
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
import { FlaskConical } from "lucide-react"

export interface LabCaseLite {
  id: string
  patientId: string
  dentistId: string | null
  toothNumbers: number[]
  restorationType: string | null
  labName: string | null
  expectedReturn: string | null
  cost: string
  status: string
  notes: string | null
}

export interface LabPatientOption {
  id: string
  label: string
}

interface Props {
  trigger?: React.ReactNode
  existing?: LabCaseLite | null
  patients: LabPatientOption[]
  dentists: LabPatientOption[]
}

export function LabCaseFormDialog({ trigger, existing = null, patients, dentists }: Props) {
  const { t, locale } = useI18n()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [patientId, setPatientId] = useState(existing?.patientId ?? "")
  const [dentistId, setDentistId] = useState(existing?.dentistId ?? "")
  const [status, setStatus] = useState(existing?.status ?? "CREATED")
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const ar = locale === "ar"

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!patientId) {
      setError(ar ? "حدد المريض أولاً" : "Select a patient first")
      return
    }
    setError(null)
    startTransition(async () => {
      const fd = new FormData(e.currentTarget)
      const res: LabCaseFormState = existing
        ? await updateLabCaseAction({}, fd)
        : await createLabCaseAction({}, fd)
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={onSubmit} className="grid gap-4 py-2">
          <DialogHeader>
            <DialogTitle>{existing ? t.laboratory.editCase : t.laboratory.newCase}</DialogTitle>
            <DialogDescription>{ar ? "حالة معملية لتركيبات أو أجهزة" : "Lab case for prosthetics or appliances"}</DialogDescription>
          </DialogHeader>

          {existing && <input type="hidden" name="id" value={existing.id} />}
          <input type="hidden" name="patientId" value={patientId} />
          <input type="hidden" name="dentistId" value={dentistId} />
          <input type="hidden" name="status" value={status} />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t.laboratory.patient} *</Label>
              <Select value={patientId} onValueChange={setPatientId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t.common.select} />
                </SelectTrigger>
                <SelectContent>
                  {patients.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t.laboratory.dentist}</Label>
              <Select value={dentistId} onValueChange={setDentistId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={ar ? "بدون طبيب" : "No dentist"} />
                </SelectTrigger>
                <SelectContent>
                  {dentists.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t.laboratory.teeth}</Label>
              <Input name="toothNumbers" defaultValue={existing?.toothNumbers.join(", ") ?? ""} placeholder={ar ? "مثال: 16, 17" : "e.g. 16, 17"} />
            </div>
            <div className="space-y-1.5">
              <Label>{t.laboratory.restoration}</Label>
              <Input name="restorationType" defaultValue={existing?.restorationType ?? ""} placeholder={ar ? "تاج / جسر…" : "Crown / bridge…"} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>{t.laboratory.labName}</Label>
              <Input name="labName" defaultValue={existing?.labName ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label>{t.laboratory.expectedReturn}</Label>
              <Input name="expectedReturn" type="date" defaultValue={(existing?.expectedReturn ?? "").slice(0, 10)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t.laboratory.cost}</Label>
              <Input name="cost" type="number" min="0" step="0.01" inputMode="decimal" defaultValue={existing?.cost ?? "0"} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t.laboratory.status}</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LAB_CASE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {labStatusLabel(s, locale)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t.laboratory.notes}</Label>
            <Textarea name="notes" rows={2} defaultValue={existing?.notes ?? ""} />
          </div>

          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={isPending}>
              <FlaskConical className="h-4 w-4" />
              {isPending ? t.common.loading : existing ? t.common.update : t.common.create}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
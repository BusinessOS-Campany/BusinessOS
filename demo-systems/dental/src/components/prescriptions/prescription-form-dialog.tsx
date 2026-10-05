"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useI18n } from "@/components/lang-provider"
import { createPrescriptionAction, type PrescriptionFormState } from "@/lib/actions/prescriptions"
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
import { Plus, Trash2 } from "lucide-react"

export interface PrescriptionOptions {
  patients: { id: string; label: string }[]
  dentists: { id: string; label: string }[]
}

interface ItemRow {
  rowId: string
}

interface Props {
  trigger?: React.ReactNode
  options: PrescriptionOptions
  defaultDentistId?: string
}

let rowSeq = 0
const newRow = (): ItemRow => ({ rowId: `rx-${++rowSeq}` })

export function PrescriptionFormDialog({ trigger, options, defaultDentistId }: Props) {
  const { t, locale } = useI18n()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [patientId, setPatientId] = useState("")
  const [dentistId, setDentistId] = useState(defaultDentistId ?? "")
  const [rows, setRows] = useState<ItemRow[]>([newRow()])
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const addRow = () => setRows((prev) => [...prev, newRow()])
  const removeRow = (rowId: string) => setRows((prev) => prev.filter((r) => r.rowId !== rowId))

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!patientId) {
      setError(locale === "ar" ? "حدد المريض أولاً" : t.common.required)
      return
    }
    const formData = new FormData(e.currentTarget)
    const names = formData.getAll("itemName").map((x) => String(x).trim())
    if (names.length === 0 || names.every((n) => n === "")) {
      setError(locale === "ar" ? "أضف دواءً واحداً على الأقل" : "Add at least one medication")
      return
    }
    setError(null)
    startTransition(async () => {
      const res: PrescriptionFormState = await createPrescriptionAction({}, formData)
      if (res.ok) {
        router.refresh()
        setOpen(false)
        setPatientId("")
        setRows([newRow()])
      } else {
        setError(locale === "ar" ? "حدث خطأ أثناء الحفظ" : t.common.error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={onSubmit} className="grid gap-4 py-2">
          <DialogHeader>
            <DialogTitle>{locale === "ar" ? "وصفة طبية جديدة" : "New Prescription"}</DialogTitle>
            <DialogDescription>
              {locale === "ar" ? "أدخل المريض والأدوية الموصوفة" : "Enter the patient and the prescribed medications"}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <input type="hidden" name="patientId" value={patientId} />
            <input type="hidden" name="dentistId" value={dentistId} />

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t.patients.fullName} *</Label>
                <Select value={patientId} onValueChange={setPatientId}>
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
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{locale === "ar" ? "الأدوية" : "Medications"}</Label>
                <Button type="button" size="sm" variant="outline" onClick={addRow}>
                  <Plus className="h-3.5 w-3.5" />
                  {locale === "ar" ? "إضافة دواء" : "Add"}
                </Button>
              </div>

              {rows.map((row) => (
                <div key={row.rowId} className="rounded-lg border p-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">
                        {locale === "ar" ? "اسم الدواء *" : "Medication *"}
                      </label>
                      <Input name="itemName" placeholder="Amoxicillin" />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Dose</label>
                        <Input name="itemDose" placeholder="500 mg" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">
                          {locale === "ar" ? "مرات/يوم" : "Frequency"}
                        </label>
                        <Input name="itemFrequency" placeholder="3x daily" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">
                          {locale === "ar" ? "المدة" : "Duration"}
                        </label>
                        <Input name="itemDuration" placeholder="7 days" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Route</label>
                      <Input name="itemRoute" placeholder="Oral" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">
                        {locale === "ar" ? "الكمية" : "Quantity"}
                      </label>
                      <Input name="itemQuantity" placeholder="21 tabs" />
                    </div>
                    <div className="sm:col-span-2 space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">
                        {locale === "ar" ? "تعليمات" : "Instructions"}
                      </label>
                      <div className="flex gap-2">
                        <Input name="itemInstructions" placeholder={locale === "ar" ? "بعد الأكل…" : "After meals…"} className="flex-1" />
                        {rows.length > 1 && (
                          <Button type="button" size="icon" variant="ghost" className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeRow(row.rowId)}>
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">remove</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rx-instructions">{locale === "ar" ? "تعليمات عامة" : "General instructions"}</Label>
                <Textarea id="rx-instructions" name="instructions" rows={2} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rx-notes">{t.common.notes}</Label>
                <Textarea id="rx-notes" name="notes" rows={2} />
              </div>
            </div>

            {error && (
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
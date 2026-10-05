"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useI18n } from "@/components/lang-provider"
import { createTreatmentPlanAction, type TreatmentPlanFormState } from "@/lib/actions/treatment-plans"
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
import { Plus, Trash2, ClipboardPlus } from "lucide-react"

const SEVERITIES = [
  { value: "MILD", en: "Mild", ar: "بسيط" },
  { value: "MODERATE", en: "Moderate", ar: "متوسط" },
  { value: "SEVERE", en: "Severe", ar: "شديد" },
  { value: "CRITICAL", en: "Critical", ar: "حرج" },
] as const

export type PlanOption = { id: string; label: string }
export type ProcedureOption = { id: string; label: string }

interface Row {
  rowId: string
  procedureId: string
}

interface Props {
  patients: PlanOption[]
  dentists: PlanOption[]
  procedures: ProcedureOption[]
  defaultDentistId?: string
}

let rowSeq = 1000
const newRow = (): Row => ({ rowId: `plan-${++rowSeq}`, procedureId: "" })

export function TreatmentPlanFormDialog({ patients, dentists, procedures, defaultDentistId }: Props) {
  const { t, locale } = useI18n()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [patientId, setPatientId] = useState("")
  const [dentistId, setDentistId] = useState(defaultDentistId ?? "")
  const [priority, setPriority] = useState("MODERATE")
  const [rows, setRows] = useState<Row[]>([newRow()])
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const ar = locale === "ar"

  const addRow = () => setRows((prev) => [...prev, newRow()])
  const removeRow = (rowId: string) => setRows((prev) => prev.filter((r) => r.rowId !== rowId))
  const setRowProcedure = (rowId: string, procedureId: string) =>
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, procedureId } : r)))

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!patientId) {
      setError(ar ? "حدد المريض أولاً" : t.common.select)
      return
    }
    const names = [e.currentTarget.elements.namedItem("nameEn"), e.currentTarget.elements.namedItem("nameAr")]
    if ((names[0] as HTMLInputElement | null)?.value.trim() === "" || (names[1] as HTMLInputElement | null)?.value.trim() === "") {
      setError(ar ? "أدخل اسم الخطة بالعربية والإنجليزية" : "Plan name is required in both languages")
      return
    }
    const fd = new FormData(e.currentTarget)
    const procIds = fd.getAll("procedureId") as string[]
    if (procIds.length === 0 || procIds.every((p) => p === "")) {
      setError(ar ? "أضف إجراءً واحداً على الأقل" : "Add at least one procedure")
      return
    }
    setError(null)
    startTransition(async () => {
      const res: TreatmentPlanFormState = await createTreatmentPlanAction({}, fd)
      if (res.ok) {
        router.refresh()
        setOpen(false)
        setPatientId("")
        setRows([newRow()])
      } else {
        setError(ar ? "حدث خطأ أثناء الحفظ" : t.common.error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <ClipboardPlus className="h-4 w-4" />
          {t.treatmentPlans.newPlan}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <form onSubmit={onSubmit} className="grid gap-4 py-2">
          <DialogHeader>
            <DialogTitle>{t.treatmentPlans.newPlan}</DialogTitle>
            <DialogDescription>{ar ? "خطة علاجية بمجموعة إجراءات مقترحة" : "A treatment plan with proposed procedures and pricing"}</DialogDescription>
          </DialogHeader>

          <input type="hidden" name="patientId" value={patientId} />
          <input type="hidden" name="dentistId" value={dentistId} />
          <input type="hidden" name="priority" value={priority} />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t.treatmentPlans.planNameEn} *</Label>
              <Input name="nameEn" placeholder="Full upper arch restoration" />
            </div>
            <div className="space-y-1.5">
              <Label>{t.treatmentPlans.planNameAr} *</Label>
              <Input name="nameAr" placeholder="ترميم كامل للفك العلوي" />
            </div>
            <div className="space-y-1.5">
              <Label>{t.patients.fullName} *</Label>
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
              <Label>{t.appointments.dentist}</Label>
              <Select value={dentistId} onValueChange={setDentistId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t.common.select} />
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
            <div className="space-y-1.5">
              <Label>{t.treatmentPlans.priority}</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t.common.select} />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITIES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {ar ? s.ar : s.en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t.treatmentPlans.discount}</Label>
              <Input name="discount" type="number" min="0" step="0.01" inputMode="decimal" placeholder="0" />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-base">{t.treatmentPlans.procedures}</Label>
              <Button type="button" size="sm" variant="outline" onClick={addRow}>
                <Plus className="h-3.5 w-3.5" />
                {t.treatmentPlans.addProcedure}
              </Button>
            </div>

            {rows.map((row) => (
              <div key={row.rowId} className="rounded-lg border p-3">
                <div className="grid gap-2 sm:grid-cols-4">
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-xs font-medium text-muted-foreground">{t.treatmentPlans.procedure} *</label>
                    <Select value={row.procedureId} onValueChange={(v) => setRowProcedure(row.rowId, v)}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={t.common.select} />
                      </SelectTrigger>
                      <SelectContent>
                        {procedures.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">{t.treatmentPlans.quantity}</label>
                    <Input name="quantity" type="number" min="1" step="1" inputMode="numeric" defaultValue="1" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">{t.treatmentPlans.tooth}</label>
                    <Input name="toothNumber" type="number" min="1" max="48" inputMode="numeric" placeholder="#" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">{t.treatmentPlans.discountAmount}</label>
                    <Input name="lineDiscount" type="number" min="0" step="0.01" inputMode="decimal" placeholder="0" />
                  </div>
                  {rows.length > 1 && (
                    <div className="flex items-end justify-end">
                      <Button type="button" size="icon" variant="ghost" className="h-9 w-9 text-muted-foreground hover:text-destructive" onClick={() => removeRow(row.rowId)}>
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">remove</span>
                      </Button>
                    </div>
                  )}
                </div>
                <input type="hidden" name="procedureId" value={row.procedureId} />
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label>{t.treatmentPlans.description}</Label>
            <Textarea name="description" rows={2} />
          </div>

          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? t.common.loading : t.treatmentPlans.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
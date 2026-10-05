"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, Loader2, Plus, Trash2 } from "lucide-react"
import { saveToothConditionsAction, removeToothConditionAction } from "@/lib/actions/dental-chart"
import { CONDITION_VISUALS, TOOTH_CONDITIONS, TOOTH_SURFACES, SEVERITIES } from "@/lib/constants/clinical"
import type { ToothMeta } from "@/lib/dental-tooth"
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
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

export interface ToothConditionDTO {
  id: string
  condition: string
  surfaces: string[]
  severity: string | null
  notes: string | null
  date: string
}

export interface ToothRecordDTO {
  id: string
  toothNumber: number
  dentition: string
  conditions: ToothConditionDTO[]
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  tooth: ToothMeta
  record?: ToothRecordDTO
  patientId: string
  dentition: "ADULT" | "PRIMARY"
  canEdit: boolean
  locale: "ar" | "en"
}

export function ConditionEditorDialog({ open, onOpenChange, tooth, record, patientId, dentition, canEdit, locale }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [condition, setCondition] = useState("CARIES")
  const [surfaces, setSurfaces] = useState<string[]>([])
  const [severity, setSeverity] = useState("")
  const [notes, setNotes] = useState("")
  const [message, setMessage] = useState<string | null>(null)

  const conditions = record?.conditions ?? []
  const condLabel = (v: string) => {
    const f = TOOTH_CONDITIONS.find((c) => c.value === v)
    return f ? (locale === "ar" ? f.ar : f.en) : v
  }
  const surfLabel = (v: string) => {
    const f = TOOTH_SURFACES.find((s) => s.value === v)
    return f ? (locale === "ar" ? f.ar : f.en) : v
  }
  const sevLabel = (v: string | null) => {
    if (!v) return null
    const f = SEVERITIES.find((s) => s.value === v)
    return f ? (locale === "ar" ? f.ar : f.en) : v
  }

  function toggleSurface(v: string, checked: boolean) {
    setSurfaces((prev) => (checked ? [...prev, v] : prev.filter((x) => x !== v)))
  }

  function addCondition() {
    setMessage(null)
    startTransition(async () => {
      const res = await saveToothConditionsAction(patientId, tooth.number, dentition, [
        {
          condition,
          surfaces,
          severity: severity || null,
          notes: notes || null,
        },
      ])
      if (res.ok) {
        setCondition("CARIES")
        setSurfaces([])
        setSeverity("")
        setNotes("")
        router.refresh()
      } else {
        setMessage(res.error === "permission" ? "missing permission" : "save failed")
      }
    })
  }

  function removeCondition(id: string) {
    setMessage(null)
    startTransition(async () => {
      const res = await removeToothConditionAction(id)
      if (res.ok) router.refresh()
      else setMessage("remove failed")
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            #{tooth.number} — {locale === "ar" ? tooth.nameAr : tooth.nameEn}
          </DialogTitle>
          <DialogDescription>
            {locale === "ar" ? "حالة السن والسطح المشترك" : "Tooth condition and affected surfaces"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {message && <p className="text-sm text-destructive">{message}</p>}

          {conditions.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase text-muted-foreground">Conditions</p>
              <ul className="space-y-2">
                {conditions.map((c) => (
                  <li key={c.id} className="flex items-start justify-between gap-3 rounded-md border bg-background px-3 py-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: CONDITION_VISUALS[c.condition]?.color ?? "#999" }}
                        />
                        <span className="text-sm font-medium">{condLabel(c.condition)}</span>
                        {sevLabel(c.severity) && (
                          <span className="text-xs text-muted-foreground">• {sevLabel(c.severity)}</span>
                        )}
                      </div>
                      {c.surfaces.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {c.surfaces.map(surfLabel).join(", ")}
                        </p>
                      )}
                      {c.notes && <p className="text-xs text-muted-foreground">{c.notes}</p>}
                    </div>
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => removeCondition(c.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span className="sr-only">remove</span>
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {conditions.length === 0 && !canEdit && (
            <p className="text-sm text-muted-foreground">{locale === "ar" ? "لا توجد حالات مسجلة" : "No conditions recorded"}</p>
          )}

          {canEdit && (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
              <p className="text-xs font-medium uppercase text-muted-foreground">
                {locale === "ar" ? "إضافة حالة" : "Add condition"}
              </p>

              <div className="space-y-1.5">
                <Label>{locale === "ar" ? "الحالة" : "Condition"}</Label>
                <Select value={condition} onValueChange={setCondition}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Condition" />
                  </SelectTrigger>
                  <SelectContent>
                    {TOOTH_CONDITIONS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {locale === "ar" ? c.ar : c.en}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>{locale === "ar" ? "الأسطح" : "Surfaces"}</Label>
                <div className="flex flex-wrap gap-2">
                  {TOOTH_SURFACES.map((s) => {
                    const checked = surfaces.includes(s.value)
                    return (
                      <label
                        key={s.value}
                        className={cn(
                          "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                          checked ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent"
                        )}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={checked}
                          onChange={(e) => toggleSurface(s.value, e.target.checked)}
                        />
                        {checked && <Check className="h-3 w-3" />}
                        <span>{locale === "ar" ? s.ar : s.en}</span>
                      </label>
                    )
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{locale === "ar" ? "الشدة" : "Severity"}</Label>
                  <Select value={severity} onValueChange={setSeverity}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={locale === "ar" ? "اختر" : "None"} />
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
                  <Label>{locale === "ar" ? "الملاحظات" : "Notes"}</Label>
                  <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
              </div>

              <Button type="button" size="sm" onClick={addCondition} disabled={isPending} className="w-full">
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {locale === "ar" ? "إضافة" : "Add"}
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {locale === "ar" ? "إغلاق" : "Close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
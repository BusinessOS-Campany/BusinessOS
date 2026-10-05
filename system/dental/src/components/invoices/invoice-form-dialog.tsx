"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useI18n } from "@/components/lang-provider"
import { createInvoiceAction, type InvoiceFormState } from "@/lib/actions/invoices"
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
import { Plus, Trash2, ReceiptText } from "lucide-react"

export type InvoicePatientOption = { id: string; label: string }
export type InvoiceProcedureLight = {
  id: string
  code: string
  nameEn: string
  nameAr: string
  price: string
}

interface Row {
  rowId: string
  procedureId: string
  desc: string
  price: string
}

interface Props {
  trigger?: React.ReactNode
  patients: InvoicePatientOption[]
  dentists: InvoicePatientOption[]
  procedures: InvoiceProcedureLight[]
  defaultDentistId?: string
}

let rowSeq = 2000
const newRow = (): Row => ({ rowId: `inv-${++rowSeq}`, procedureId: "", desc: "", price: "" })

export function InvoiceFormDialog({ trigger, patients, dentists, procedures, defaultDentistId }: Props) {
  const { t, locale } = useI18n()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [patientId, setPatientId] = useState("")
  const [dentistId, setDentistId] = useState(defaultDentistId ?? "")
  const [rows, setRows] = useState<Row[]>([newRow()])
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const ar = locale === "ar"

  const addRow = () => setRows((prev) => [...prev, newRow()])
  const removeRow = (rowId: string) => setRows((prev) => prev.filter((r) => r.rowId !== rowId))

  const pickProcedure = (rowId: string, procedureId: string) => {
    const proc = procedures.find((p) => p.id === procedureId)
    setRows((prev) =>
      prev.map((r) =>
        r.rowId === rowId
          ? { ...r, procedureId, desc: proc ? (locale === "ar" ? proc.nameAr : proc.nameEn) : r.desc, price: proc ? proc.price : r.price }
          : r
      )
    )
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!patientId) {
      setError(ar ? "حدد المريض أولاً" : t.common.select)
      return
    }
    setError(null)
    startTransition(async () => {
      const fd = new FormData(e.currentTarget)
      const res: InvoiceFormState = await createInvoiceAction({}, fd)
      if (res.ok) {
        router.refresh()
        setOpen(false)
        setPatientId("")
        setRows([newRow()])
      } else if (res.error === "no_items") {
        setError(ar ? "أضف بنداً واحداً على الأقل" : "Add at least one item")
      } else {
        setError(ar ? "حدث خطأ أثناء الحفظ" : t.common.error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <form onSubmit={onSubmit} className="grid gap-4 py-2">
          <DialogHeader>
            <DialogTitle>{t.billing.newInvoice}</DialogTitle>
            <DialogDescription>{ar ? "فاتورة علاجية ببنود من دليل الإجراءات أو وصف حر" : "Issue an invoice with catalog procedures or free-text items"}</DialogDescription>
          </DialogHeader>

          <input type="hidden" name="patientId" value={patientId} />
          <input type="hidden" name="dentistId" value={dentistId} />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t.billing.patient} *</Label>
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
              <Label>{t.billing.dentist}</Label>
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
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-base">{t.billing.items}</Label>
              <Button type="button" size="sm" variant="outline" onClick={addRow}>
                <Plus className="h-3.5 w-3.5" />
                {t.billing.addItem}
              </Button>
            </div>

            {rows.map((row) => (
              <div key={row.rowId} className="rounded-lg border p-3">
                <div className="grid gap-2 sm:grid-cols-6">
                  <div className="space-y-1 sm:col-span-3">
                    <label className="text-xs font-medium text-muted-foreground">{t.billing.description} *</label>
                    <Input
                      name="description"
                      value={row.desc}
                      onChange={(e) => setRows((prev) => prev.map((r) => (r.rowId === row.rowId ? { ...r, desc: e.target.value } : r)))}
                      placeholder={ar ? "وصف البند…" : "Item description…"}
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-3">
                    <label className="text-xs font-medium text-muted-foreground">{ar ? "الإجراء (اختياري)" : "Procedure (optional)"}</label>
                    <Select value={row.procedureId} onValueChange={(v) => pickProcedure(row.rowId, v)}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={t.common.select} />
                      </SelectTrigger>
                      <SelectContent>
                        {procedures.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.code} · {ar ? p.nameAr : p.nameEn}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">{t.billing.quantity}</label>
                    <Input name="quantity" type="number" min="1" step="1" inputMode="numeric" defaultValue="1" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">{t.billing.unitPrice}</label>
                    <Input
                      name="unitPrice"
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={row.price}
                      onChange={(e) => setRows((prev) => prev.map((r) => (r.rowId === row.rowId ? { ...r, price: e.target.value } : r)))}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">{t.billing.discount}</label>
                    <Input name="lineDiscount" type="number" min="0" step="0.01" inputMode="decimal" placeholder="0" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Tooth</label>
                    <Input name="toothNumber" type="number" min="1" max="48" inputMode="numeric" placeholder="#" />
                  </div>
                  {rows.length > 1 && (
                    <div className="flex items-end justify-end">
                      <Button type="button" size="icon" variant="ghost" className="h-9 w-9 text-muted-foreground hover:text-destructive" onClick={() => removeRow(row.rowId)}>
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">{t.billing.removeItem}</span>
                      </Button>
                    </div>
                  )}
                </div>
                <input type="hidden" name="procedureId" value={row.procedureId} />
              </div>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t.billing.discount}</Label>
              <Input name="discount" type="number" min="0" step="0.01" inputMode="decimal" placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>{t.billing.tax} (%)</Label>
              <Input name="taxRate" type="number" min="0" max="100" step="0.01" inputMode="decimal" placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>{t.billing.issueDate}</Label>
              <Input name="issueDate" type="date" />
            </div>
            <div className="space-y-1.5">
              <Label>{t.billing.dueDate}</Label>
              <Input name="dueDate" type="date" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t.billing.notes}</Label>
            <Textarea name="notes" rows={2} />
          </div>

          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={isPending}>
              <ReceiptText className="h-4 w-4" />
              {isPending ? t.common.loading : t.billing.issueNew}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
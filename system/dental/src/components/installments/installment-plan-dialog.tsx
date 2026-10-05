"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useI18n } from "@/components/lang-provider"
import { createPaymentPlanAction, type PaymentPlanFormState } from "@/lib/actions/installments"
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
import { Plus, Trash2, CalendarClock } from "lucide-react"

export type InstallmentPatientOption = { id: string; label: string }
export type InstallmentInvoiceOption = {
  id: string
  invoiceNo: string
  patientId: string
  remaining: number
}

interface Row {
  rowId: string
}

interface Props {
  trigger?: React.ReactNode
  patients: InstallmentPatientOption[]
  invoices: InstallmentInvoiceOption[]
}

let rowSeq = 3000
const newRow = (): Row => ({ rowId: `inst-${++rowSeq}` })

export function InstallmentPlanDialog({ trigger, patients, invoices }: Props) {
  const { t, locale } = useI18n()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [patientId, setPatientId] = useState("")
  const [invoiceId, setInvoiceId] = useState("")
  const [rows, setRows] = useState<Row[]>([newRow()])
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const ar = locale === "ar"

  const addRow = () => setRows((prev) => [...prev, newRow()])
  const removeRow = (rowId: string) => setRows((prev) => prev.filter((r) => r.rowId !== rowId))
  const invoiceOptions = invoices.filter((i) => i.patientId === patientId)

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!patientId) {
      setError(ar ? "حدد المريض أولاً" : t.common.select)
      return
    }
    setError(null)
    startTransition(async () => {
      const fd = new FormData(e.currentTarget)
      const res: PaymentPlanFormState = await createPaymentPlanAction({}, fd)
      if (res.ok) {
        router.refresh()
        setOpen(false)
        setPatientId("")
        setInvoiceId("")
        setRows([newRow()])
      } else if (res.error === "duplicate_invoice") {
        setError(ar ? "للفاتورة خطة سداد موجودة" : "This invoice already has a payment plan")
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
            <DialogTitle>{t.installments.newPlan}</DialogTitle>
            <DialogDescription>{ar ? "خطة سداد بأقساط موزعة على تواريخ" : "A repayment plan split into installments with due dates"}</DialogDescription>
          </DialogHeader>

          <input type="hidden" name="patientId" value={patientId} />
          <input type="hidden" name="invoiceId" value={invoiceId} />

          <div className="space-y-1.5">
            <Label>{t.installments.patient} *</Label>
            <Select value={patientId} onValueChange={(v) => { setPatientId(v); setInvoiceId("") }}>
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
            <Label>{ar ? "الفاتورة (اختياري)" : "Invoice (optional)"}</Label>
            <Select value={invoiceId} onValueChange={setInvoiceId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t.common.select} />
              </SelectTrigger>
              <SelectContent>
                {invoiceOptions.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.invoiceNo} · {i.remaining.toLocaleString()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t.installments.totalAmount} *</Label>
              <Input name="totalAmount" type="number" min="0.01" step="0.01" inputMode="decimal" placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>{t.installments.downPayment}</Label>
              <Input name="downPayment" type="number" min="0" step="0.01" inputMode="decimal" placeholder="0" />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-base">{t.installments.installments}</Label>
              <Button type="button" size="sm" variant="outline" onClick={addRow}>
                <Plus className="h-3.5 w-3.5" />
                {t.installments.addInstallment}
              </Button>
            </div>

            {rows.map((row) => (
              <div key={row.rowId} className="rounded-lg border p-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">{t.installments.payAmount} *</label>
                    <Input name="amount" type="number" min="0.01" step="0.01" inputMode="decimal" placeholder="0" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">{t.installments.dueDate} *</label>
                    <Input name="dueDate" type="date" />
                  </div>
                  {rows.length > 1 && (
                    <div className="flex items-end justify-end sm:col-span-2">
                      <Button type="button" size="icon" variant="ghost" className="h-9 w-9 text-muted-foreground hover:text-destructive" onClick={() => removeRow(row.rowId)}>
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">{t.common.delete}</span>
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label>{t.installments.notes}</Label>
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
              <CalendarClock className="h-4 w-4" />
              {isPending ? t.common.loading : t.common.create}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
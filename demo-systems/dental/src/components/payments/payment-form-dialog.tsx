"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useI18n } from "@/components/lang-provider"
import { recordPaymentAction, type PaymentFormState } from "@/lib/actions/payments"
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
import { PAYMENT_METHODS } from "@/lib/constants/billing"
import { Banknote } from "lucide-react"

export type PaymentPatientOption = { id: string; label: string }
export type PaymentInvoiceOption = {
  id: string
  invoiceNo: string
  patientId: string
  remaining: number
}

interface Props {
  trigger?: React.ReactNode
  patients: PaymentPatientOption[]
  invoices: PaymentInvoiceOption[]
}

const METHOD_TO_KEY: Record<string, string> = {
  CASH: "methodCash",
  BANK_TRANSFER: "methodBankTransfer",
  CARD: "methodCard",
  MOBILE_WALLET: "methodMobileWallet",
  OTHER: "methodOther",
}

export function PaymentFormDialog({ trigger, patients, invoices }: Props) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [patientId, setPatientId] = useState("")
  const [invoiceId, setInvoiceId] = useState("")
  const [method, setMethod] = useState("CASH")
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const invoiceOptions = invoices.filter((i) => i.patientId === patientId)

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!patientId) {
      setError(t.common.select)
      return
    }
    setError(null)
    startTransition(async () => {
      const fd = new FormData(e.currentTarget)
      const res: PaymentFormState = await recordPaymentAction({}, fd)
      if (res.ok) {
        router.refresh()
        setOpen(false)
        setPatientId("")
        setInvoiceId("")
      } else if (res.error === "amount_exceeds") {
        setError(t.dialogs.invoiceAmountExceeds)
      } else if (res.error === "invoice_closed") {
        setError(t.dialogs.invoiceClosed)
      } else {
        setError(t.common.error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={onSubmit} className="grid gap-4 py-2">
          <DialogHeader>
            <DialogTitle>{t.payments.newPayment}</DialogTitle>
            <DialogDescription>{t.dialogs.paymentHint}</DialogDescription>
          </DialogHeader>

          <input type="hidden" name="patientId" value={patientId} />
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <input type="hidden" name="method" value={method} />

          <div className="space-y-1.5">
            <Label>{t.payments.patient} *</Label>
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
            <Label>{t.payments.invoice}</Label>
            <Select value={invoiceId} onValueChange={setInvoiceId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t.dialogs.noInvoiceOption} />
              </SelectTrigger>
              <SelectContent>
                {invoiceOptions.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.invoiceNo} · {t.billing.remaining}: {i.remaining.toLocaleString()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t.payments.amount} *</Label>
            <Input name="amount" type="number" min="0.01" step="0.01" inputMode="decimal" placeholder="0" />
          </div>

          <div className="space-y-1.5">
            <Label>{t.payments.method}</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {t.billing[METHOD_TO_KEY[m] as keyof typeof t.billing]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t.payments.reference}</Label>
            <Input name="reference" placeholder={t.payments.reference} />
          </div>

          <div className="space-y-1.5">
            <Label>{t.payments.notes}</Label>
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
              <Banknote className="h-4 w-4" />
              {isPending ? t.common.loading : t.payments.newPayment}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
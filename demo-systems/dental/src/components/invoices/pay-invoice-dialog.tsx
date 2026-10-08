"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useI18n } from "@/components/lang-provider"
import { recordPaymentAction, type PaymentFormState } from "@/lib/actions/payments"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PAYMENT_METHODS } from "@/lib/constants/billing"
import { Banknote } from "lucide-react"

interface Props {
  trigger?: React.ReactNode
  patientId: string
  patientNo: string
  invoiceId: string
  remaining: number
}

const PAYMENT_METHOD_TO_KEY: Record<string, string> = {
  CASH: "methodCash",
  BANK_TRANSFER: "methodBankTransfer",
  CARD: "methodCard",
  MOBILE_WALLET: "methodMobileWallet",
  OTHER: "methodOther",
}

export function PayInvoiceDialog({ trigger, patientId, patientNo, invoiceId, remaining }: Props) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [method, setMethod] = useState("CASH")
  const [amount, setAmount] = useState(remaining > 0 ? String(remaining) : "")
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const fd = new FormData(e.currentTarget)
      const res: PaymentFormState = await recordPaymentAction({}, fd)
      if (res.ok) {
        router.refresh()
        setOpen(false)
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
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} className="grid gap-4 py-2">
          <DialogHeader>
            <DialogTitle>{t.billing.recordPayment}</DialogTitle>
            <DialogDescription>{t.billing.invoice} {invoiceId.slice(0, 8)} · {patientNo}</DialogDescription>
          </DialogHeader>

          <input type="hidden" name="patientId" value={patientId} />
          <input type="hidden" name="invoiceId" value={invoiceId} />

          <div className="space-y-1.5">
            <Label>{t.payments.amount} *</Label>
            <Input
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t.billing.remaining}: {remaining.toLocaleString()}</p>
          </div>

          <div className="space-y-1.5">
            <Label>{t.billing.paymentMethod}</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {t.billing[PAYMENT_METHOD_TO_KEY[m] as keyof typeof t.billing]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <input type="hidden" name="method" value={method} />

          <div className="space-y-1.5">
            <Label>{t.billing.reference}</Label>
            <Input name="reference" placeholder={t.payments.reference} />
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
              {isPending ? t.common.loading : t.billing.recordPayment}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
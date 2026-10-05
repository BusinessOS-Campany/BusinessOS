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

export function PayInvoiceDialog({ trigger, patientId, patientNo, invoiceId, remaining }: Props) {
  const { t, locale } = useI18n()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [method, setMethod] = useState("CASH")
  const [amount, setAmount] = useState(remaining > 0 ? String(remaining) : "")
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const ar = locale === "ar"

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
        setError(ar ? "المبلغ أكبر من المتبقي على الفاتورة" : "Amount exceeds invoice balance")
      } else if (res.error === "invoice_closed") {
        setError(ar ? "الفاتورة ملغاة أو مستردة" : "Invoice is closed")
      } else {
        setError(ar ? "حدث خطأ أثناء حفظ الدفعة" : t.common.error)
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
            <DialogDescription>{ar ? `فاتورة ${invoiceId.slice(0, 8)}` : `Invoice ${invoiceId.slice(0, 8)}`} · {patientNo}</DialogDescription>
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
                    {ar
                      ? { CASH: "نقدي", BANK_TRANSFER: "تحويل بنكي", CARD: "بطاقة", MOBILE_WALLET: "محفظة جوال", OTHER: "أخرى" }[m]
                      : { CASH: "Cash", BANK_TRANSFER: "Bank transfer", CARD: "Card", MOBILE_WALLET: "Mobile wallet", OTHER: "Other" }[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <input type="hidden" name="method" value={method} />

          <div className="space-y-1.5">
            <Label>{t.billing.reference}</Label>
            <Input name="reference" placeholder={ar ? "رقم المرجع…" : "Reference…"} />
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
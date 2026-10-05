"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useI18n } from "@/components/lang-provider"
import { payInstallmentAction, cancelInstallmentAction } from "@/lib/actions/installments"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Check, X } from "lucide-react"

export interface InstallmentLite {
  id: string
  amount: string
  paidAmount: string
  status: string
}

interface Props {
  installment: InstallmentLite
}

export function InstallmentRowActions({ installment }: Props) {
  const { t, locale } = useI18n()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [paying, setPaying] = useState(false)
  const [amount, setAmount] = useState("")
  const ar = locale === "ar"

  const remaining = Number(installment.amount) - Number(installment.paidAmount)
  const done = installment.status === "PAID" || remaining <= 0
  const cancelled = installment.status === "CANCELLED"

  const onPay = () => {
    const amt = Number(amount)
    if (!amt || amt <= 0) return
    startTransition(async () => {
      await payInstallmentAction(installment.id, amt)
      router.refresh()
      setPaying(false)
      setAmount("")
    })
  }
  const onCancel = () => {
    if (!window.confirm(ar ? "إلغاء هذا القسط؟" : "Cancel this installment?")) return
    startTransition(async () => {
      await cancelInstallmentAction(installment.id)
      router.refresh()
    })
  }

  if (done) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
        <Check className="h-3.5 w-3.5" />
        {ar ? "مدفوع" : "Paid"}
      </span>
    )
  }
  if (cancelled) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <X className="h-3.5 w-3.5" />
        {ar ? "ملغي" : "Cancelled"}
      </span>
    )
  }

  return (
    <div className="flex items-center gap-2">
      {paying ? (
        <>
          <Input
            autoFocus
            type="number"
            min="0.01"
            step="0.01"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={String(remaining)}
            className="h-8 w-24"
          />
          <Button size="sm" variant="outline" disabled={isPending} onClick={onPay}>
            <Check className="h-3.5 w-3.5" />
            {t.common.save}
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" disabled={isPending} onClick={() => { setPaying(false); setAmount("") }}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </>
      ) : (
        <>
          <Button size="sm" variant="outline" disabled={isPending} onClick={() => setPaying(true)}>
            {ar ? "سداد" : "Pay"}
          </Button>
          <Button size="sm" variant="ghost" className="text-destructive" disabled={isPending} onClick={onCancel}>
            {ar ? "إلغاء" : "Cancel"}
          </Button>
        </>
      )}
    </div>
  )
}
"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { useI18n } from "@/components/lang-provider"
import { refundPaymentAction } from "@/lib/actions/payments"
import { Button } from "@/components/ui/button"
import { Undo2 } from "lucide-react"

export function RefundPaymentButton({ paymentId }: { paymentId: string }) {
  const { locale } = useI18n()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const ar = locale === "ar"

  const onRefund = () => {
    if (!window.confirm(ar ? "استرداد هذه الدفعة؟" : "Refund this payment?")) return
    startTransition(async () => {
      await refundPaymentAction(paymentId)
      router.refresh()
    })
  }

  return (
    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" disabled={isPending} onClick={onRefund} title={ar ? "استرداد" : "Refund"}>
      <Undo2 className="h-3.5 w-3.5" />
    </Button>
  )
}
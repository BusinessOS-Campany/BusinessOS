"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { useI18n } from "@/components/lang-provider"
import { INVOICE_STATUSES } from "@/lib/constants/billing"
import { updateInvoiceStatusAction, refundInvoiceAction, deleteInvoiceAction } from "@/lib/actions/invoices"
import { Button } from "@/components/ui/button"
import { Undo2, Trash2 } from "lucide-react"

interface Props {
  invoiceId: string
  status: string
  canEdit: boolean
  canRefund: boolean
  canDelete: boolean
}

export function InvoiceStatusControls({ invoiceId, status, canEdit, canRefund, canDelete }: Props) {
  const { locale } = useI18n()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const ar = locale === "ar"

  const onChange = (next: string) => {
    startTransition(async () => {
      await updateInvoiceStatusAction(invoiceId, next)
      router.refresh()
    })
  }
  const onRefund = () => {
    if (!window.confirm(ar ? "استرداد هذه الفاتورة؟" : "Refund this invoice?")) return
    startTransition(async () => {
      await refundInvoiceAction(invoiceId)
      router.refresh()
    })
  }
  const onDelete = () => {
    if (!window.confirm(ar ? "حذف هذه الفاتورة؟" : "Delete this invoice?")) return
    startTransition(async () => {
      await deleteInvoiceAction(invoiceId)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canEdit && (
        <select
          value={status}
          onChange={(e) => onChange(e.target.value)}
          disabled={isPending}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {INVOICE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      )}
      {canRefund && status !== "REFUNDED" && (
        <Button variant="outline" size="sm" disabled={isPending} onClick={onRefund}>
          <Undo2 className="h-3.5 w-3.5" />
          {ar ? "استرداد" : "Refund"}
        </Button>
      )}
      {canDelete && (status === "DRAFT" || status === "CANCELLED") && (
        <Button variant="outline" size="sm" disabled={isPending} onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />
          {ar ? "حذف" : "Delete"}
        </Button>
      )}
    </div>
  )
}
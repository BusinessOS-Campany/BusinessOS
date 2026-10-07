"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { useI18n } from "@/components/lang-provider"
import { deleteExpenseAction } from "@/lib/actions/expenses"
import { Button } from "@/components/ui/button"
import { Trash2 } from "lucide-react"

export function DeleteExpenseButton({ expenseId }: { expenseId: string }) {
  const { t } = useI18n()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const onDelete = () => {
    if (!window.confirm(t.expenses.deleteConfirm)) return
    startTransition(async () => {
      await deleteExpenseAction(expenseId)
      router.refresh()
    })
  }

  return (
    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" disabled={isPending} onClick={onDelete} title={t.common.delete}>
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  )
}
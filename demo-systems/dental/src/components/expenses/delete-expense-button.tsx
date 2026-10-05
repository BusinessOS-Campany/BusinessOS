"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { useI18n } from "@/components/lang-provider"
import { deleteExpenseAction } from "@/lib/actions/expenses"
import { Button } from "@/components/ui/button"
import { Trash2 } from "lucide-react"

export function DeleteExpenseButton({ expenseId }: { expenseId: string }) {
  const { locale } = useI18n()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const ar = locale === "ar"

  const onDelete = () => {
    if (!window.confirm(ar ? "حذف هذا المصروف؟" : "Delete this expense?")) return
    startTransition(async () => {
      await deleteExpenseAction(expenseId)
      router.refresh()
    })
  }

  return (
    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" disabled={isPending} onClick={onDelete} title={ar ? "حذف" : "Delete"}>
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  )
}
"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useI18n } from "@/components/lang-provider"
import { createExpenseAction, updateExpenseAction, type ExpenseFormState } from "@/lib/actions/expenses"
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
import { EXPENSE_CATEGORIES } from "@/lib/constants/billing"
import { Receipt } from "lucide-react"

export interface ExpenseLite {
  id: string
  category: string
  amount: string
  description: string | null
  expenseDate: string
  notes: string | null
}

interface Props {
  trigger?: React.ReactNode
  existing?: ExpenseLite | null
}

export function ExpenseFormDialog({ trigger, existing = null }: Props) {
  const { t, locale } = useI18n()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [category, setCategory] = useState(existing?.category ?? "OTHER")
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const ar = locale === "ar"

  const catLabel = (c: string) =>
    ar
      ? { RENT: "إيجار", SALARIES: "رواتب", UTILITIES: "مرافق", DENTAL_MATERIALS: "مواد طب أسنان", LABORATORY: "مختبر", EQUIPMENT: "معدات", MAINTENANCE: "صيانة", MARKETING: "تسويق", OTHER: "أخرى" }[c] ?? c
      : { RENT: "Rent", SALARIES: "Salaries", UTILITIES: "Utilities", DENTAL_MATERIALS: "Dental materials", LABORATORY: "Laboratory", EQUIPMENT: "Equipment", MAINTENANCE: "Maintenance", MARKETING: "Marketing", OTHER: "Other" }[c] ?? c

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const fd = new FormData(e.currentTarget)
      const res: ExpenseFormState = existing
        ? await updateExpenseAction({}, fd)
        : await createExpenseAction({}, fd)
      if (res.ok) {
        router.refresh()
        setOpen(false)
      } else {
        setError(ar ? "حدث خطأ أثناء الحفظ" : t.common.error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} className="grid gap-4 py-2">
          <DialogHeader>
            <DialogTitle>{existing ? t.expenses.editExpense : t.expenses.newExpense}</DialogTitle>
            <DialogDescription>{ar ? "سجل مصروفاً تشغيلياً" : "Record an operational expense"}</DialogDescription>
          </DialogHeader>

          {existing && <input type="hidden" name="id" value={existing.id} />}
          <input type="hidden" name="category" value={category} />

          <div className="space-y-1.5">
            <Label>{t.expenses.category} *</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {catLabel(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t.expenses.amount} *</Label>
              <Input name="amount" type="number" min="0.01" step="0.01" inputMode="decimal" defaultValue={existing?.amount ?? ""} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>{t.expenses.date}</Label>
              <Input name="expenseDate" type="date" defaultValue={(existing?.expenseDate ?? "").slice(0, 10)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t.expenses.description}</Label>
            <Input name="description" defaultValue={existing?.description ?? ""} placeholder={ar ? "وصف المصروف…" : "Expense description…"} />
          </div>

          <div className="space-y-1.5">
            <Label>{t.expenses.notes}</Label>
            <Textarea name="notes" rows={2} defaultValue={existing?.notes ?? ""} />
          </div>

          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={isPending}>
              <Receipt className="h-4 w-4" />
              {isPending ? t.common.loading : existing ? t.common.update : t.common.create}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useI18n } from "@/components/lang-provider"
import {
  createProcedureAction,
  updateProcedureAction,
  type ProcedureFormState,
} from "@/lib/actions/treatment-plans"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ListOrdered, Pencil } from "lucide-react"

export interface ProcedureRecord {
  id: string
  code: string
  nameEn: string
  nameAr: string
  category: string | null
  price: string
  isActive: boolean
}

interface Props {
  records: ProcedureRecord[]
}

const emptyForm = {
  id: "",
  code: "",
  nameEn: "",
  nameAr: "",
  category: "",
  durationMinutes: "",
  price: "",
  cost: "",
  taxRate: "",
  isActive: true,
}

type FormState = typeof emptyForm

export function ProcedureManagerDialog({ records }: Props) {
  const { t, locale } = useI18n()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [editing, setEditing] = useState(false)
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const ar = locale === "ar"

  const startNew = () => {
    setForm(emptyForm)
    setEditing(false)
    setError(null)
  }
  const startEdit = (r: ProcedureRecord) => {
    setForm({
      id: r.id,
      code: r.code,
      nameEn: r.nameEn,
      nameAr: r.nameAr,
      category: r.category ?? "",
      durationMinutes: "",
      price: r.price,
      cost: "",
      taxRate: "",
      isActive: r.isActive,
    })
    setEditing(true)
    setError(null)
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setError(null)
    startTransition(async () => {
      const res: ProcedureFormState = editing
        ? await updateProcedureAction({}, fd)
        : await createProcedureAction({}, fd)
      if (res.ok) {
        router.refresh()
        setForm(emptyForm)
        setEditing(false)
      } else if (res.error === "duplicate") {
        setError(ar ? "رمز الإجراء مكرر" : "Procedure code already exists")
      } else {
        setError(ar ? "حدث خطأ أثناء الحفظ" : t.common.error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <ListOrdered className="h-4 w-4" />
          {t.treatmentPlans.manageProcedures}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t.treatmentPlans.manageProcedures}</DialogTitle>
          <DialogDescription>{ar ? "دليل الإجراءات والأسعار المستخدمة في خطط العلاج والفواتير" : "Procedure catalog used for treatment plans and invoices"}</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="grid gap-3 rounded-lg border p-4">
          <input type="hidden" name="id" value={form.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>{t.treatmentPlans.procedureCode} *</Label>
              <Input name="code" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="CROWN-001" />
            </div>
            <div className="space-y-1">
              <Label>{t.treatmentPlans.procedureCategory}</Label>
              <Input name="category" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} placeholder="Restorative" />
            </div>
            <div className="space-y-1">
              <Label>{t.treatmentPlans.procedureNameEn} *</Label>
              <Input name="nameEn" value={form.nameEn} onChange={(e) => setForm((f) => ({ ...f, nameEn: e.target.value }))} placeholder="Zirconia crown" />
            </div>
            <div className="space-y-1">
              <Label>{t.treatmentPlans.procedureNameAr} *</Label>
              <Input name="nameAr" value={form.nameAr} onChange={(e) => setForm((f) => ({ ...f, nameAr: e.target.value }))} placeholder="تاج زيركون" />
            </div>
            <div className="space-y-1">
              <Label>{t.treatmentPlans.durationMinutes}</Label>
              <Input name="durationMinutes" type="number" min="0" inputMode="numeric" value={form.durationMinutes} onChange={(e) => setForm((f) => ({ ...f, durationMinutes: e.target.value }))} placeholder="60" />
            </div>
            <div className="space-y-1">
              <Label>{t.treatmentPlans.price}</Label>
              <Input name="price" type="number" min="0" step="0.01" inputMode="decimal" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} placeholder="0" />
            </div>
            <div className="space-y-1">
              <Label>{t.treatmentPlans.cost}</Label>
              <Input name="cost" type="number" min="0" step="0.01" inputMode="decimal" value={form.cost} onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))} placeholder="0" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox name="isActive" checked={form.isActive} onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v === true }))} />
              {t.treatmentPlans.isActive}
            </label>
          </div>
          {error && <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={startNew}>
              {t.common.clear}
            </Button>
            <Button type="submit" size="sm" disabled={isPending}>
              {editing ? t.common.update : t.common.create}
            </Button>
          </div>
        </form>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.treatmentPlans.procedureCode}</TableHead>
              <TableHead>{t.treatmentPlans.procedureNameEn}</TableHead>
              <TableHead>{t.treatmentPlans.procedureNameAr}</TableHead>
              <TableHead>{t.treatmentPlans.price}</TableHead>
              <TableHead className="text-end">{t.common.actions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  {t.treatmentPlans.noProcedures}
                </TableCell>
              </TableRow>
            ) : (
              records.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="tabular-nums">{r.code}</TableCell>
                  <TableCell>{r.nameEn}</TableCell>
                  <TableCell>{r.nameAr}</TableCell>
                  <TableCell className="tabular-nums">{r.price}</TableCell>
                  <TableCell className="text-end">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(r)} title={t.common.edit}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <DialogFooter className="sm:justify-end">
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t.common.close}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
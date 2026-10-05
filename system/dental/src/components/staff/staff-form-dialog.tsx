"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useI18n } from "@/components/lang-provider"
import { createUserAction, updateUserAction, type StaffFormState } from "@/lib/actions/staff"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { UserPlus, UserCog } from "lucide-react"

export interface StaffLite {
  id: string
  name: string
  nameAr: string | null
  username: string | null
  email: string
  phone: string | null
  roleId: string
  branchId: string | null
  isActive: boolean
}

export interface RoleOption {
  id: string
  key: string
  nameAr: string | null
}

export interface BranchOption {
  id: string
  name: string
  nameAr: string | null
}

interface Props {
  trigger?: React.ReactNode
  existing?: StaffLite | null
  roles: RoleOption[]
  branches: BranchOption[]
}

export function StaffFormDialog({ trigger, existing = null, roles, branches }: Props) {
  const { t, locale } = useI18n()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [roleId, setRoleId] = useState(existing?.roleId ?? "")
  const [branchId, setBranchId] = useState(existing?.branchId ?? "__none__")
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const ar = locale === "ar"

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!roleId) {
      setError(ar ? "اختر الدور" : "Select a role")
      return
    }
    setError(null)
    startTransition(async () => {
      const fd = new FormData(e.currentTarget)
      if (branchId === "__none__") fd.delete("branchId")
      const res: StaffFormState = existing
        ? await updateUserAction({}, fd)
        : await createUserAction({}, fd)
if (res.ok) {
        router.refresh()
        setOpen(false)
      } else {
        const msg =
          res.error === "duplicate_email"
            ? ar ? "البريد الإلكتروني مستخدم مسبقًا" : "Email already in use"
            : res.error === "duplicate_username"
              ? ar ? "اسم المستخدم مستخدم مسبقًا" : "Username already in use"
              : res.error === "self"
                ? (ar ? "لا يمكنك تعديل حسابك هنا" : "You cannot edit your own account here")
                : (ar ? "حدث خطأ أثناء الحفظ" : t.common.error)
        setError(msg)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={onSubmit} className="grid gap-4 py-2">
          <DialogHeader>
            <DialogTitle>{existing ? t.staff.editStaff : t.staff.newStaff}</DialogTitle>
            <DialogDescription>
              {ar ? "حساب موظف بصلاحيات قابلة للتحديد" : "Staff account with configurable permissions"}
            </DialogDescription>
          </DialogHeader>

          {existing && <input type="hidden" name="id" value={existing.id} />}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t.staff.name} *</Label>
              <Input name="name" defaultValue={existing?.name ?? ""} required maxLength={120} />
            </div>
            <div className="space-y-1.5">
              <Label>{t.staff.nameAr}</Label>
              <Input name="nameAr" defaultValue={existing?.nameAr ?? ""} maxLength={120} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t.staff.username}</Label>
              <Input name="username" dir="ltr" defaultValue={existing?.username ?? ""} maxLength={40} autoComplete="off" placeholder={ar ? "اسم المستخدم" : "username"} />
            </div>
            <div className="space-y-1.5">
              <Label>{t.staff.phone}</Label>
              <Input name="phone" dir="ltr" defaultValue={existing?.phone ?? ""} maxLength={30} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t.staff.email} *</Label>
              <Input name="email" type="email" defaultValue={existing?.email ?? ""} required />
            </div>
            <div className="space-y-1.5">
              <Label>{t.staff.branch}</Label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{ar ? "بدون فرع" : "No branch"}</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {ar ? (b.nameAr ?? b.name) : b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {branchId !== "__none__" && <input type="hidden" name="branchId" value={branchId} />}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t.staff.role} *</Label>
              <Select value={roleId} onValueChange={setRoleId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t.common.select} />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {ar ? (r.nameAr ?? r.key) : r.key}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t.staff.password} {!existing && <span>*</span>}</Label>
              <Input name="password" type="password" dir="ltr" autoComplete="new-password" minLength={8} required={!existing} />
              {existing && (
                <p className="text-xs text-muted-foreground">{t.staff.leaveEmpty}</p>
              )}
            </div>
            {existing && (
              <label className="flex items-end gap-2 pb-1">
                <Checkbox name="isActive" defaultChecked={existing.isActive} />
                <span className="text-sm">{existing.isActive ? t.staff.active : t.staff.inactive}</span>
              </label>
            )}
          </div>

          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={isPending}>
              {existing ? <UserCog className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
              {isPending ? t.common.loading : existing ? t.common.update : t.common.create}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
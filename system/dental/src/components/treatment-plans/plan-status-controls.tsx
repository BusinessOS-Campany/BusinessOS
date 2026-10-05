"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { useI18n } from "@/components/lang-provider"
import { updateTreatmentPlanStatusAction, updatePlanProcedureStatusAction } from "@/lib/actions/treatment-plans"

const PLAN_STATUSES = [
  "DRAFT", "PROPOSED", "ACCEPTED", "IN_PROGRESS", "PARTIALLY_COMPLETED", "COMPLETED", "REJECTED", "CANCELLED",
] as const
const PROC_STATUSES = ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const

export interface PlanProcedureLite {
  id: string
  status: string
  nameEn: string
}

interface Props {
  planId: string
  status: string
  procedures: PlanProcedureLite[]
}

export function PlanStatusControls({ planId, status, procedures }: Props) {
  const { locale } = useI18n()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const ar = locale === "ar"

  const onChangePlan = (next: string) => {
    startTransition(async () => {
      await updateTreatmentPlanStatusAction(planId, next)
      router.refresh()
    })
  }
  const onChangeProc = (procId: string, next: string) => {
    startTransition(async () => {
      await updatePlanProcedureStatusAction(planId, procId, next)
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">{ar ? "حالة الخطة:" : "Plan status:"}</span>
        <select
          value={status}
          onChange={(e) => onChangePlan(e.target.value)}
          disabled={isPending}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {PLAN_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      {procedures.map((p) => (
        <div key={p.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
          <span className="text-sm font-medium">{p.nameEn}</span>
          <select
            value={p.status}
            onChange={(e) => onChangeProc(p.id, e.target.value)}
            disabled={isPending}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {PROC_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  )
}
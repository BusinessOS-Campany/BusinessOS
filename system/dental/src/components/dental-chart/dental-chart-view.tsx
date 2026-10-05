"use client"

import { useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { cn } from "@/lib/utils"
import { CONDITION_VISUALS } from "@/lib/constants/clinical"
import type { ToothMeta } from "@/lib/dental-tooth"
import { DentalChart } from "./dental-chart"
import { ConditionEditorDialog, type ToothRecordDTO } from "./condition-editor-dialog"

const DentalChart3D = dynamic(() => import("./dental-chart-3d").then((m) => m.DentalChart3D), {
  ssr: false,
  loading: () => <div className="h-[460px] w-full animate-pulse rounded-xl border bg-muted" />,
})

interface Props {
  patientId: string
  records: ToothRecordDTO[]
  canEdit: boolean
  locale: "ar" | "en"
}

export function DentalChartView({ patientId, records, canEdit, locale }: Props) {
  const [view, setView] = useState<"2d" | "3d">("2d")
  const [dentition, setDentition] = useState<"ADULT" | "PRIMARY">("ADULT")
  const [selected, setSelected] = useState<ToothMeta | null>(null)

  const selectedRecord = useMemo(() => {
    if (!selected) return undefined
    return records.find((r) => r.toothNumber === selected.number && r.dentition === dentition)
  }, [records, selected, dentition])

  const presentConditions = useMemo(() => {
    const set = new Set<string>()
    for (const r of records) {
      for (const c of r.conditions as { condition: string }[]) set.add(c.condition)
    }
    return [...set]
  }, [records])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-md border bg-muted p-0.5">
          {(["2d", "3d"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn(
                "rounded px-3 py-1 text-xs font-medium transition-colors",
                view === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              )}
            >
              {v === "2d" ? (locale === "ar" ? "ثنائي الأبعاد" : "2D") : "3D"}
            </button>
          ))}
        </div>

        <div className="inline-flex rounded-md border bg-muted p-0.5">
          {(["ADULT", "PRIMARY"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDentition(d)}
              className={cn(
                "rounded px-3 py-1 text-xs font-medium transition-colors",
                dentition === d ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              )}
            >
              {locale === "ar" ? (d === "ADULT" ? "دائم" : "لبني") : d === "ADULT" ? "Adult" : "Primary"}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {locale === "ar" ? "انقر على أي سن لعرض أو تعديل حالته" : "Click a tooth to view or edit its condition"}
      </p>

      {view === "2d" ? (
        <DentalChart dentition={dentition} records={records} onSelect={(t) => setSelected(t)} locale={locale} />
      ) : (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            {locale === "ar" ? "التشخيص التفاعلي — انقر على أي سن لتسجيل الحالة" : "Interactive diagnosis — click a tooth to record a condition"}
          </p>
          <DentalChart3D
            records={records}
            dentition={dentition}
            onSelect={(t) => setSelected(t)}
            selectedNumber={selected?.number}
            locale={locale}
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2 rounded-lg border bg-background p-3">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-[3px]" style={{ backgroundColor: CONDITION_VISUALS.HEALTHY.color }} />
          <span className="text-xs">{locale === "ar" ? "سليم" : "Healthy"}</span>
        </span>
        {presentConditions
          .filter((c) => CONDITION_VISUALS[c])
          .map((c) => (
            <span key={c} className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-[3px]" style={{ backgroundColor: CONDITION_VISUALS[c].color }} />
              <span className="text-xs">{locale === "ar" ? CONDITION_VISUALS[c].labelAr : CONDITION_VISUALS[c].labelEn}</span>
            </span>
          ))}
      </div>

      {selected && (
        <ConditionEditorDialog
          open
          onOpenChange={(open) => !open && setSelected(null)}
          tooth={selected}
          record={selectedRecord}
          patientId={patientId}
          dentition={dentition}
          canEdit={canEdit}
          locale={locale}
        />
      )}
    </div>
  )
}
"use client"

import { useLayoutEffect, useMemo, useRef, useState } from "react"
import { TEETH_BY_DENTITION, type ToothMeta } from "@/lib/dental-tooth"
import { CONDITION_VISUALS } from "@/lib/constants/clinical"
import { cn } from "@/lib/utils"
import { ToothSvg } from "./tooth-svg"
import type { ToothRecordDTO } from "./condition-editor-dialog"

const HEALTHY_COLOR = CONDITION_VISUALS.HEALTHY.color

interface Props {
  dentition: "ADULT" | "PRIMARY"
  records: ToothRecordDTO[]
  onSelect: (tooth: ToothMeta) => void
  locale: "ar" | "en"
}

const UPPER_QUADS: Record<"ADULT" | "PRIMARY", number[]> = {
  ADULT: [1, 2],
  PRIMARY: [5, 6],
}
const LOWER_QUADS: Record<"ADULT" | "PRIMARY", number[]> = {
  ADULT: [4, 3],
  PRIMARY: [8, 7],
}

const TOOTH_W_BASE = 42
const TOOTH_W_MIN = 26
const ARC_AMP = 8
const H_GAP = 24 // gap between the two quad groups in one row

export function DentalChart({ dentition, records, onSelect, locale }: Props) {
  const teeth = TEETH_BY_DENTITION[dentition]
  const gridRef = useRef<HTMLDivElement>(null)
  const [gridW, setGridW] = useState(0)

  useLayoutEffect(() => {
    const el = gridRef.current
    if (!el) return
    const update = () => setGridW(el.getBoundingClientRect().width)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const toothW = gridW > 0
    ? Math.min(TOOTH_W_BASE, Math.max(TOOTH_W_MIN, Math.floor((gridW - H_GAP) / 8)))
    : TOOTH_W_BASE
  const arcAmp = gridW > 0 ? ARC_AMP * (toothW / TOOTH_W_BASE) : ARC_AMP

  const byTooth = useMemo(() => {
    const map = new Map<number, ToothRecordDTO>()
    for (const r of records) {
      if (r.dentition === dentition) map.set(r.toothNumber, r)
    }
    return map
  }, [records, dentition])

  const dominant = (rec?: ToothRecordDTO) => {
    if (!rec || rec.conditions.length === 0) return undefined
    return rec.conditions[rec.conditions.length - 1].condition
  }

  function renderQuad(quadId: number, rowArc: "upper" | "lower") {
    const rowTeeth = teeth.filter((t) => t.arc === rowArc).sort((a, b) => a.order - b.order)
    const quadTeeth = rowTeeth.filter((t) => t.quadrant === quadId).sort((a, b) => a.slot - b.slot)
    const firstIdx = rowTeeth.findIndex((t) => t.number === quadTeeth[0].number)
    const total = rowTeeth.length
    return quadTeeth.map((t, i) => {
      const rec = byTooth.get(t.number)
      const cond = dominant(rec)
      const visual = cond ? CONDITION_VISUALS[cond] : undefined
      const fill = visual?.color ?? HEALTHY_COLOR
      const isExtracted = cond === "MISSING" || cond === "EXTRACTED"
      // Continuous arch: 0 at the back molars, ARC_AMP at the midline.
      const norm = total > 1 ? Math.sin((Math.PI * (firstIdx + i)) / (total - 1)) : 0
      const offset = rowArc === "upper" ? arcAmp * norm : -arcAmp * norm
      return (
        <button
          key={t.number}
          type="button"
          className="group flex flex-col items-center gap-0.5 rounded-md px-0.5 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          style={{ marginTop: offset, width: toothW }}
          onClick={() => onSelect(t)}
          title={`#${t.number} ${locale === "ar" ? t.nameAr : t.nameEn}`}
        >
          <span
            className={cn(
              "block w-full transition-transform group-hover:scale-105",
              isExtracted && "opacity-50"
            )}
          >
            <ToothSvg
              kind={t.kind}
              fill={fill}
              stroke={isExtracted ? "#6b7280" : "currentColor"}
              active={false}
            />
          </span>
          <span className="text-[10px] font-medium tabular-nums leading-none text-muted-foreground sm:text-[11px]">
            {t.number}
          </span>
        </button>
      )
    })
  }

  return (
    <div dir="ltr" className="w-full space-y-2 rounded-xl border bg-background p-2 sm:p-4">
      <div className="space-y-1">
        <p className="text-[10px] font-medium text-muted-foreground sm:text-xs">
          {locale === "ar" ? "الفك العلوي" : "Upper arch"}
        </p>
        <div className="flex justify-center" ref={gridRef}>
          <div className="flex items-end">
            {renderQuad(UPPER_QUADS[dentition][0], "upper")}
          </div>
          <div className="w-[24px]" />
          <div className="flex items-end">
            {renderQuad(UPPER_QUADS[dentition][1], "upper")}
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-[10px] font-medium text-muted-foreground sm:text-xs">
          {locale === "ar" ? "الفك السفلي" : "Lower arch"}
        </p>
        <div className="flex justify-center">
          <div className="flex items-start">
            {renderQuad(LOWER_QUADS[dentition][0], "lower")}
          </div>
          <div className="w-[24px]" />
          <div className="flex items-start">
            {renderQuad(LOWER_QUADS[dentition][1], "lower")}
          </div>
        </div>
      </div>
    </div>
  )
}
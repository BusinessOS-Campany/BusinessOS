import type { ToothKind } from "@/lib/dental-tooth"

const TOOTH_PATH =
  "M6,10 C6,4 14,2 22,2 C30,2 38,4 38,10 L38,20 L34,22 L34,38 " +
  "C34,46 40,50 40,56 L40,58 L34,58 L32,52 L28,52 C28,52 26,40 26,34 L18,34 " +
  "C18,40 16,52 16,52 L12,52 L10,58 L4,58 L4,56 C4,50 10,46 10,38 L10,22 L6,20 Z"

const WIDTH: Record<ToothKind, number> = {
  molar: 44,
  premolar: 40,
  canine: 34,
  incisor: 32,
}

interface Props {
  kind: ToothKind
  fill: string
  stroke: string
  active?: boolean
}

export function ToothSvg({ kind, fill, stroke, active }: Props) {
  const w = WIDTH[kind]
  const h = 60
  const scale = w / 44
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="block h-auto w-full"
      style={{ transform: `scaleX(${scale})`, transformOrigin: "center" }}
    >
      <path
        d={TOOTH_PATH}
        fill={fill}
        stroke={stroke}
        strokeWidth={active ? 2.5 : 1.5}
        strokeLinejoin="round"
      />
    </svg>
  )
}
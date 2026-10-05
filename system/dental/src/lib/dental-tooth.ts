export type ToothKind = "molar" | "premolar" | "canine" | "incisor"

export interface ToothMeta {
  number: number
  quadrant: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
  arc: "upper" | "lower"
  side: "left" | "right"
  kind: ToothKind
  nameEn: string
  nameAr: string
  /** 2D display slot (0..7 within its half of the row) */
  slot: number
  /** row display order within the arch (row index * 100 + slot) */
  order: number
  /** 3D position */
  pos: [number, number, number]
  /** 3D rotation (yaw around Y) */
  rot: number
}

function kindOf(n10: number, n: number): ToothKind {
  const last = n % 10
  if (last === 1 || last === 2) return "incisor"
  if (last === 3) return "canine"
  if (last === 4 || last === 5) return "premolar"
  return "molar"
}

function nameOf(kind: ToothKind): [string, string] {
  const map: Record<ToothKind, [string, string]> = {
    incisor: ["incisor", "قاطع"],
    canine: ["canine", "ناب"],
    premolar: ["premolar", "ضاحك"],
    molar: ["molar", "طاحن"],
  }
  return map[kind]
}

interface QuadDef {
  quadrant: ToothMeta["quadrant"]
  arc: "upper" | "lower"
  side: "left" | "right"
  nums: number[]
  rowOrder: number
}

const ADULT_QUADS: QuadDef[] = [
  { quadrant: 1, arc: "upper", side: "right", nums: [18, 17, 16, 15, 14, 13, 12, 11], rowOrder: 0 },
  { quadrant: 2, arc: "upper", side: "left", nums: [21, 22, 23, 24, 25, 26, 27, 28], rowOrder: 1 },
  { quadrant: 4, arc: "lower", side: "right", nums: [48, 47, 46, 45, 44, 43, 42, 41], rowOrder: 0 },
  { quadrant: 3, arc: "lower", side: "left", nums: [31, 32, 33, 34, 35, 36, 37, 38], rowOrder: 1 },
]

const PRIMARY_QUADS: QuadDef[] = [
  { quadrant: 5, arc: "upper", side: "right", nums: [55, 54, 53, 52, 51], rowOrder: 0 },
  { quadrant: 6, arc: "upper", side: "left", nums: [61, 62, 63, 64, 65], rowOrder: 1 },
  { quadrant: 8, arc: "lower", side: "right", nums: [85, 84, 83, 82, 81], rowOrder: 0 },
  { quadrant: 7, arc: "lower", side: "left", nums: [71, 72, 73, 74, 75], rowOrder: 1 },
]

const ARCH_R = 82

function build(quads: QuadDef[]): ToothMeta[] {
  const teeth: ToothMeta[] = []
  for (const q of quads) {
    const len = q.nums.length
    q.nums.forEach((n, i) => {
      const kind = kindOf(q.quadrant, n)
      const [nameEn, nameAr] = nameOf(kind)
      const slot = i
      const order = q.rowOrder * 100 + slot
      // 3D arch placement
      // angle: -A..A where 0 = front center. right side (viewer left) negative x.
      const span = q.arc === "upper" ? 46 : 44
      const angle = ((-span / 2 + (i + 0.5) * (span / len)) * Math.PI) / 180
      const dir = q.side === "right" ? -1 : 1
      const x = dir * ARCH_R * Math.sin(angle)
      const z = -Math.abs(ARCH_R * Math.cos(angle))
      const pos: [number, number, number] = [x, q.arc === "upper" ? 0 : -22, z]
      const rot = dir * -angle
      teeth.push({ number: n, quadrant: q.quadrant, arc: q.arc, side: q.side, kind, nameEn, nameAr, slot, order, pos, rot })
    })
  }
  return teeth
}

export const ADULT_TEETH: ToothMeta[] = build(ADULT_QUADS)
export const PRIMARY_TEETH: ToothMeta[] = build(PRIMARY_QUADS)

export const TEETH_BY_DENTITION: Record<"ADULT" | "PRIMARY", ToothMeta[]> = {
  ADULT: ADULT_TEETH,
  PRIMARY: PRIMARY_TEETH,
}

export const DENTITION_LABELS: Record<"ADULT" | "PRIMARY", { en: string; ar: string }> = {
  ADULT: { en: "Adult", ar: "دائم" },
  PRIMARY: { en: "Primary / Baby teeth", ar: "لبني / أسنان الأطفال" },
}

export function findTooth(number: number, dentition: "ADULT" | "PRIMARY"): ToothMeta | undefined {
  return TEETH_BY_DENTITION[dentition].find((t) => t.number === number)
}

export const QUADRANT_LABELS: Record<number, { en: string; ar: string }> = {
  1: { en: "Upper right", ar: "الفك العلوي يمين" },
  2: { en: "Upper left", ar: "الفك العلوي يسار" },
  3: { en: "Lower left", ar: "الفك السفلي يسار" },
  4: { en: "Lower right", ar: "الفك السفلي يمين" },
  5: { en: "Upper right", ar: "الفك العلوي يمين" },
  6: { en: "Upper left", ar: "الفك العلوي يسار" },
  7: { en: "Lower left", ar: "الفك السفلي يسار" },
  8: { en: "Lower right", ar: "الفك السفلي يمين" },
}
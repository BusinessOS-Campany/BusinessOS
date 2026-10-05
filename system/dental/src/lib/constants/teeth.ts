export type ToothType = "incisor" | "canine" | "premolar" | "molar"
export type Quadrant = "UR" | "UL" | "LR" | "LL"

export type ToothInfo = {
  fdi: number
  universal: number | null
  palmer: number
  quadrant: Quadrant
  nameEn: string
  nameAr: string
  type: ToothType
}

export const UPPER_JAW_FDI = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28]
export const LOWER_JAW_FDI = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38]

const UNIVERSAL_UP_RIGHT = [1, 2, 3, 4, 5, 6, 7, 8]
const UNIVERSAL_UP_LEFT = [9, 10, 11, 12, 13, 14, 15, 16]
const UNIVERSAL_LOW_LEFT = [17, 18, 19, 20, 21, 22, 23, 24]
const UNIVERSAL_LOW_RIGHT = [25, 26, 27, 28, 29, 30, 31, 32]

export function universalFor(fdi: number): number | null {
  const idxUp = UPPER_JAW_FDI.findIndex((f) => f === fdi)
  if (idxUp !== -1) return idxUp < 8 ? UNIVERSAL_UP_RIGHT[idxUp] : UNIVERSAL_UP_LEFT[idxUp - 8]
  const idxLow = LOWER_JAW_FDI.findIndex((f) => f === fdi)
  if (idxLow !== -1) return idxLow < 8 ? UNIVERSAL_LOW_RIGHT[idxLow] : UNIVERSAL_LOW_LEFT[idxLow - 8]
  return null
}

export function palmerFor(fdi: number): number {
  return fdi % 10
}

export function quadrantFor(fdi: number): Quadrant {
  if (fdi >= 11 && fdi <= 18) return "UR"
  if (fdi >= 21 && fdi <= 28) return "UL"
  if (fdi >= 41 && fdi <= 48) return "LR"
  return "LL"
}

function typeFor(fdi: number): ToothType {
  const last = fdi % 10
  if (last === 1 || last === 2) return "incisor"
  if (last === 3) return "canine"
  if (last === 4 || last === 5) return "premolar"
  return "molar"
}

const NAME_EN_MAP: Record<number, string> = {
  1: "central incisor",
  2: "lateral incisor",
  3: "canine",
  4: "first premolar",
  5: "second premolar",
  6: "first molar",
  7: "second molar",
  8: "third molar",
}

const NAME_AR_MAP: Record<number, string> = {
  1: "القاطعة المركزية",
  2: "القاطعة الجانبية",
  3: "الناب",
  4: "الضاحك الأول",
  5: "الضاحك الثاني",
  6: "الرحى الأولى",
  7: "الرحى الثانية",
  8: "رحى العقل",
}

function nameArFor(fdi: number): string {
  const upper = fdi >= 11 && fdi <= 28
  const role = NAME_AR_MAP[fdi % 10] ?? "سن"
  const jaw = upper ? "الفك العلوي" : "الفك السفلي"
  const sideLeft = (upper && fdi >= 21) || (!upper && fdi <= 38)
  const side = sideLeft ? "الأيسر" : "الأيمن"
  return `${role} ${side} من ${jaw}`
}

export function adultTeeth(): ToothInfo[] {
  const all = [...UPPER_JAW_FDI.slice().reverse(), ...LOWER_JAW_FDI.slice().reverse()]
  return all.map((fdi) => {
    const upper = fdi >= 11 && fdi <= 28
    const sideLeft = (upper && fdi >= 21) || (!upper && fdi <= 38)
    return {
      fdi,
      universal: universalFor(fdi),
      palmer: palmerFor(fdi),
      quadrant: quadrantFor(fdi),
      nameEn: `${upper ? "upper" : "lower"} ${sideLeft ? "left" : "right"} ${NAME_EN_MAP[fdi % 10]}`,
      nameAr: nameArFor(fdi),
      type: typeFor(fdi),
    }
  })
}

export const ADULT_TEETH = adultTeeth()

export function toothByFdi(fdi: number): ToothInfo | undefined {
  return ADULT_TEETH.find((t) => t.fdi === fdi)
}

// ---------- Primary (deciduous) ----------

export const PRIMARY_FDI_UPPER = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65]
export const PRIMARY_FDI_LOWER = [85, 84, 83, 82, 81, 71, 72, 73, 74, 75]

const UNI_PRIMARY_MAP: Record<number, string> = {
  55: "A", 54: "B", 53: "C", 52: "D", 51: "E",
  61: "F", 62: "G", 63: "H", 64: "I", 65: "J",
  71: "K", 72: "L", 73: "M", 74: "N", 75: "O",
  81: "P", 82: "Q", 83: "R", 84: "S", 85: "T",
}

export function primaryUniversal(fdi: number): string {
  return UNI_PRIMARY_MAP[fdi] ?? String(fdi)
}

export type PrimaryTooth = { fdi: number; universal: string; nameEn: string; nameAr: string; type: ToothType; jaw: "U" | "L" }

const PRIM_EN: Record<number, string> = { 1: "central incisor", 2: "lateral incisor", 3: "canine", 4: "first molar", 5: "second molar" }
const PRIM_AR: Record<number, string> = { 1: "القاطعة المركزية", 2: "القاطعة الجانبية", 3: "الناب", 4: "الرحى الأولى", 5: "الرحى الثانية" }

export function primaryTeeth(): PrimaryTooth[] {
  const all = [...PRIMARY_FDI_UPPER.slice().reverse(), ...PRIMARY_FDI_LOWER.slice().reverse()]
  return all.map((fdi) => {
    const upper = fdi >= 51 && fdi <= 65
    const pos = fdi % 10
    const sideLeft = (upper && fdi >= 61) || (!upper && fdi <= 75)
    const jaw = upper ? "الفك العلوي" : "الفك السفلي"
    const side = sideLeft ? "الأيسر" : "الأيمن"
    return {
      fdi,
      universal: primaryUniversal(fdi),
      nameEn: `${upper ? "upper" : "lower"} ${sideLeft ? "left" : "right"} ${PRIM_EN[pos] ?? "tooth"}`,
      nameAr: `${PRIM_AR[pos] ?? "سن"} ${side} من ${jaw}`,
      type: (pos <= 2 ? "incisor" : pos === 3 ? "canine" : "molar") as ToothType,
      jaw: upper ? "U" : "L",
    }
  })
}

export const PRIMARY_TEETH = primaryTeeth()

export type NumberingSystem = "FDI" | "UNIVERSAL" | "PALMER"

export function displayToothNumber(fdi: number, system: NumberingSystem, dentition: "ADULT" | "PRIMARY" = "ADULT"): string {
  if (dentition === "PRIMARY") {
    if (system === "UNIVERSAL") return primaryUniversal(fdi)
    if (system === "PALMER") return String(fdi % 10)
    return String(fdi)
  }
  if (system === "UNIVERSAL") return String(universalFor(fdi) ?? fdi)
  if (system === "PALMER") return String(fdi % 10)
  return String(fdi)
}
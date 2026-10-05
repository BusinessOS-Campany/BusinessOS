import type { Locale } from "@/lib/i18n"
import { LAB_STATUSES, STOCK_MOVEMENT_TYPES } from "@/lib/constants/clinical"

export const PRODUCT_CATEGORIES = [
  "MATERIALS",
  "CONSUMABLES",
  "EQUIPMENT",
  "INSTRUMENTS",
  "MEDICINES",
  "ORTHODONTICS",
  "PROSTHETICS",
  "OTHER",
] as const
export type ProductCategoryValue = (typeof PRODUCT_CATEGORIES)[number]

export const PRODUCT_UNITS = [
  { value: "pcs", en: "Piece(s)", ar: "قطعة" },
  { value: "box", en: "Box", ar: "علبة" },
  { value: "pack", en: "Pack", ar: "حزمة" },
  { value: "bottle", en: "Bottle", ar: "زجاجة" },
  { value: "set", en: "Set", ar: "طقم" },
  { value: "vial", en: "Vial", ar: "قارورة" },
  { value: "roll", en: "Roll", ar: "لفة" },
  { value: "jar", en: "Jar", ar: "وعاء" },
] as const

export const LAB_CASE_STATUSES = [
  "CREATED",
  "SENT",
  "IN_PRODUCTION",
  "READY",
  "RECEIVED",
  "DELIVERED",
  "CANCELLED",
] as const
export type LabCaseStatusValue = (typeof LAB_CASE_STATUSES)[number]

const categoryEn: Record<ProductCategoryValue, string> = {
  MATERIALS: "Materials",
  CONSUMABLES: "Consumables",
  EQUIPMENT: "Equipment",
  INSTRUMENTS: "Instruments",
  MEDICINES: "Medicines",
  ORTHODONTICS: "Orthodontics",
  PROSTHETICS: "Prosthetics",
  OTHER: "Other",
}
const categoryAr: Record<ProductCategoryValue, string> = {
  MATERIALS: "مواد علاجية",
  CONSUMABLES: "مستهلكات",
  EQUIPMENT: "معدات",
  INSTRUMENTS: "أدوات",
  MEDICINES: "أدوية",
  ORTHODONTICS: "تقويم",
  PROSTHETICS: "أطقم وجسور",
  OTHER: "أخرى",
}

export function productCategoryLabel(category: string, locale: Locale): string {
  const c = category as ProductCategoryValue
  return locale === "ar" ? categoryAr[c] ?? category : categoryEn[c] ?? category
}

const unitEn: Record<string, string> = { pcs: "Pcs", box: "Box", pack: "Pack", bottle: "Bottle", set: "Set", vial: "Vial", roll: "Roll", jar: "Jar" }
const unitAr: Record<string, string> = { pcs: "قطعة", box: "علبة", pack: "حزمة", bottle: "زجاجة", set: "طقم", vial: "قارورة", roll: "لفة", jar: "وعاء" }

export function productUnitLabel(unit: string, locale: Locale): string {
  return locale === "ar" ? unitAr[unit] ?? unit : unitEn[unit] ?? unit
}

export function labStatusLabel(status: string, locale: Locale): string {
  const m = LAB_STATUSES.find((s) => s.value === status)
  return m ? (locale === "ar" ? m.ar : m.en) : status
}

export function stockMovementLabel(type: string, locale: Locale): string {
  const m = STOCK_MOVEMENT_TYPES.find((s) => s.value === type)
  return m ? (locale === "ar" ? m.ar : m.en) : type
}
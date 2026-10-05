export const IMAGING_TYPES = [
  { value: "XRAY_PANORAMIC", en: "Panoramic X-ray", ar: "أشعة بانورامية" },
  { value: "XRAY_PERIAPICAL", en: "Periapical X-ray", ar: "أشعة حول القمة" },
  { value: "XRAY_BITEWING", en: "Bitewing X-ray", ar: "أشعة عضة" },
  { value: "XRAY_CEPHALOMETRIC", en: "Cephalometric X-ray", ar: "أشعة جمجمة" },
  { value: "XRAY_CBCT", en: "CBCT", ar: "أشعة مقطعية CBCT" },
  { value: "INTRAORAL_PHOTO", en: "Intraoral photo", ar: "صورة داخل الفم" },
  { value: "EXTRAORAL_PHOTO", en: "Extraoral photo", ar: "صورة خارج الفم" },
  { value: "OTHER", en: "Other", ar: "أخرى" },
] as const

export type ImagingTypeValue = (typeof IMAGING_TYPES)[number]["value"]

export function imagingTypeLabel(type: string, locale: "ar" | "en"): string {
  const found = IMAGING_TYPES.find((t) => t.value === type)
  if (!found) return type
  return locale === "ar" ? found.ar : found.en
}
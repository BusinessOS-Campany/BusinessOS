import type { Locale } from "@/lib/i18n"

export const SPECIALTIES = [
  { value: "GENERAL", en: "General", ar: "طبيب عام" },
  { value: "ORTHODONTIST", en: "Orthodontist", ar: "تقويم أسنان" },
  { value: "ENDODONTIST", en: "Endodontist", ar: "علاج عصب" },
  { value: "PERIODONTIST", en: "Periodontist", ar: "أمراض اللثة" },
  { value: "ORAL_SURGEON", en: "Oral surgeon", ar: "جراحة الفم" },
  { value: "PEDIATRIC", en: "Pediatric dentist", ar: "أسنان الأطفال" },
  { value: "PROSTHODONTIST", en: "Prosthodontist", ar: "تركيبات الأسنان" },
  { value: "IMPLANTOLOGIST", en: "Implantologist", ar: "زراعة الأسنان" },
  { value: "COSMETIC", en: "Cosmetic dentist", ar: "طب الأسنان التجميلي" },
] as const

export const SPECIALTY_VALUES = SPECIALTIES.map((s) => s.value) as unknown as readonly string[]

export function specialtyLabel(specialty: string, locale: Locale): string {
  const m = SPECIALTIES.find((s) => s.value === specialty)
  return m ? (locale === "ar" ? m.ar : m.en) : specialty
}

export const WORKING_DAYS = [
  { value: "SUN", en: "Sun", ar: "الأحد" },
  { value: "MON", en: "Mon", ar: "الإثنين" },
  { value: "TUE", en: "Tue", ar: "الثلاثاء" },
  { value: "WED", en: "Wed", ar: "الأربعاء" },
  { value: "THU", en: "Thu", ar: "الخميس" },
  { value: "FRI", en: "Fri", ar: "الجمعة" },
  { value: "SAT", en: "Sat", ar: "السبت" },
] as const

export function workingDayLabel(day: string, locale: Locale): string {
  const m = WORKING_DAYS.find((d) => d.value === day)
  return m ? (locale === "ar" ? m.ar : m.en) : day
}

const AUDIT_MODULES_AR: Record<string, string> = {
  Auth: "المصادقة",
  Patients: "المرضى",
  Appointments: "المواعيد",
  "Waiting Room": "قاعة الانتظار",
  Clinical: "السجل السريري",
  "Treatment Plans": "خطط العلاج",
  "Dental Chart": "مخطط الأسنان",
  Prescriptions: "الوصفات",
  Imaging: "الصور الشعاعية",
  Invoices: "الفواتير",
  Payments: "المدفوعات",
  Installments: "الأقساط",
  Expenses: "المصروفات",
  Inventory: "المخزون",
  Suppliers: "الموردون",
  Laboratory: "المختبر",
  Staff: "الموظفون",
  Dentists: "الأطباء",
  Settings: "الإعدادات",
  Notifications: "الإشعارات",
}

export function auditModuleLabel(module: string, locale: Locale): string {
  return locale === "ar" ? (AUDIT_MODULES_AR[module] ?? module) : module
}

export const AUDIT_MODULES = Object.keys(AUDIT_MODULES_AR) as readonly string[]
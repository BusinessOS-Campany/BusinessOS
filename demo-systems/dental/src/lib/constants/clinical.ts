export const TOOTH_CONDITIONS = [
  { value: "HEALTHY", en: "Healthy", ar: "سليم" },
  { value: "CARIES", en: "Caries", ar: "تسوس" },
  { value: "DEEP_CARIES", en: "Deep caries", ar: "تسوس عميق" },
  { value: "FILLING", en: "Filling", ar: "حشوة" },
  { value: "FAILED_FILLING", en: "Failed filling", ar: "حشوة تالفة" },
  { value: "CROWN", en: "Crown", ar: "تاج" },
  { value: "BRIDGE", en: "Bridge", ar: "جسر" },
  { value: "IMPLANT", en: "Implant", ar: "زرعة" },
  { value: "MISSING", en: "Missing", ar: "مفقود" },
  { value: "EXTRACTED", en: "Extracted", ar: "خلع" },
  { value: "ROOT_CANAL", en: "Root canal done", ar: "علاج عصب" },
  { value: "ROOT_CANAL_NEEDED", en: "Root canal needed", ar: "يحتاج علاج عصب" },
  { value: "FRACTURE", en: "Fracture", ar: "كسر" },
  { value: "CRACK", en: "Crack", ar: "شرخ" },
  { value: "MOBILITY", en: "Mobility", ar: "حركة" },
  { value: "PERIODONTAL_ISSUE", en: "Periodontal issue", ar: "مشكلة لثوية" },
  { value: "ABSCESS", en: "Abscess", ar: "خراج" },
  { value: "INFECTION", en: "Infection", ar: "التهاب" },
  { value: "IMPACTED", en: "Impacted", ar: "مدفون" },
  { value: "RETAINED_PRIMARY_TOOTH", en: "Retained primary tooth", ar: "سن لبنية متبقية" },
  { value: "WEAR", en: "Wear", ar: "تآكل" },
  { value: "EROSION", en: "Erosion", ar: "تآكل حمضي" },
  { value: "ABRASION", en: "Abrasion", ar: "تآكل ميكانيكي" },
  { value: "DISCOLORATION", en: "Discoloration", ar: "تصبغ" },
  { value: "VENEER", en: "Veneer", ar: "قشرة تجميلية" },
  { value: "SEALANT", en: "Sealant", ar: "مانع تسرب" },
  { value: "OTHER", en: "Other", ar: "أخرى" },
] as const

export type ToothConditionValue = (typeof TOOTH_CONDITIONS)[number]["value"]

export const TOOTH_SURFACES = [
  { value: "MESIAL", en: "Mesial", ar: "وسطي" },
  { value: "DISTAL", en: "Distal", ar: "بعيد" },
  { value: "OCCLUSAL", en: "Occlusal", ar: "طاحني" },
  { value: "BUCCAL", en: "Buccal", ar: "شدقي" },
  { value: "LINGUAL", en: "Lingual", ar: "لساني" },
  { value: "INCISAL", en: "Incisal", ar: "قاطعي" },
  { value: "CERVICAL", en: "Cervical", ar: "عنقي" },
] as const

export type SurfaceValue = (typeof TOOTH_SURFACES)[number]["value"]

export const SEVERITIES = [
  { value: "MILD", en: "Mild", ar: "بسيط" },
  { value: "MODERATE", en: "Moderate", ar: "متوسط" },
  { value: "SEVERE", en: "Severe", ar: "شديد" },
  { value: "CRITICAL", en: "Critical", ar: "حرج" },
] as const

export type SeverityValue = (typeof SEVERITIES)[number]["value"]

export const APPOINTMENT_TYPES = [
  { value: "NEW_PATIENT", en: "New patient", ar: "مريض جديد" },
  { value: "CONSULTATION", en: "Consultation", ar: "استشارة" },
  { value: "CLEANING", en: "Cleaning", ar: "تنظيف" },
  { value: "EXAMINATION", en: "Examination", ar: "فحص" },
  { value: "FILLING", en: "Filling", ar: "حشو" },
  { value: "ROOT_CANAL", en: "Root canal", ar: "علاج عصب" },
  { value: "EXTRACTION", en: "Extraction", ar: "خلع" },
  { value: "CROWN", en: "Crown", ar: "تاج" },
  { value: "BRIDGE", en: "Bridge", ar: "جسر" },
  { value: "IMPLANT", en: "Implant", ar: "زراعة" },
  { value: "ORTHODONTICS", en: "Orthodontics", ar: "تقويم" },
  { value: "WHITENING", en: "Whitening", ar: "تبييض" },
  { value: "EMERGENCY", en: "Emergency", ar: "طوارئ" },
  { value: "FOLLOW_UP", en: "Follow-up", ar: "متابعة" },
  { value: "OTHER", en: "Other", ar: "أخرى" },
] as const

export type AppointmentTypeValue = (typeof APPOINTMENT_TYPES)[number]["value"]

export const APPOINTMENT_STATUSES = [
  { value: "SCHEDULED", en: "Scheduled", ar: "مجدول" },
  { value: "CONFIRMED", en: "Confirmed", ar: "مؤكد" },
  { value: "CHECKED_IN", en: "Checked in", ar: "تم الحضور" },
  { value: "IN_TREATMENT", en: "In treatment", ar: "قيد العلاج" },
  { value: "COMPLETED", en: "Completed", ar: "مكتمل" },
  { value: "CANCELLED", en: "Cancelled", ar: "ملغي" },
  { value: "NO_SHOW", en: "No show", ar: "لم يحضر" },
  { value: "RESCHEDULED", en: "Rescheduled", ar: "أعيدت جدولته" },
] as const

export const WAITING_STATUSES = [
  { value: "WAITING", en: "Waiting", ar: "في الانتظار" },
  { value: "CALLED", en: "Called", ar: "تم استدعاؤه" },
  { value: "IN_ROOM", en: "In room", ar: "في الغرفة" },
  { value: "WITH_DENTIST", en: "With dentist", ar: "مع الطبيب" },
  { value: "COMPLETED", en: "Completed", ar: "مكتمل" },
] as const

export const INVOICE_STATUSES = [
  { value: "DRAFT", en: "Draft", ar: "مسودة" },
  { value: "ISSUED", en: "Issued", ar: "صادرة" },
  { value: "PARTIALLY_PAID", en: "Partially paid", ar: "مدفوعة جزئياً" },
  { value: "PAID", en: "Paid", ar: "مدفوعة" },
  { value: "CANCELLED", en: "Cancelled", ar: "ملغاة" },
  { value: "REFUNDED", en: "Refunded", ar: "مستردة" },
] as const

export const TREATMENT_PLAN_STATUSES = [
  { value: "DRAFT", en: "Draft", ar: "مسودة" },
  { value: "PROPOSED", en: "Proposed", ar: "مقترح" },
  { value: "ACCEPTED", en: "Accepted", ar: "مقبول" },
  { value: "IN_PROGRESS", en: "In progress", ar: "قيد التنفيذ" },
  { value: "PARTIALLY_COMPLETED", en: "Partially completed", ar: "مكتمل جزئياً" },
  { value: "COMPLETED", en: "Completed", ar: "مكتمل" },
  { value: "REJECTED", en: "Rejected", ar: "مرفوض" },
  { value: "CANCELLED", en: "Cancelled", ar: "ملغي" },
] as const

export const LAB_STATUSES = [
  { value: "CREATED", en: "Created", ar: "تم الإنشاء" },
  { value: "SENT", en: "Sent to lab", ar: "أُرسل للمختبر" },
  { value: "IN_PRODUCTION", en: "In production", ar: "قيد التصنيع" },
  { value: "READY", en: "Ready", ar: "جاهز" },
  { value: "RECEIVED", en: "Received", ar: "تم الاستلام" },
  { value: "DELIVERED", en: "Delivered", ar: "تم التسليم" },
  { value: "CANCELLED", en: "Cancelled", ar: "ملغي" },
] as const

export const STOCK_MOVEMENT_TYPES = [
  { value: "STOCK_IN", en: "Stock in", ar: "إدخال مخزون" },
  { value: "STOCK_OUT", en: "Stock out", ar: "إخراج مخزون" },
  { value: "TRANSFER_IN", en: "Transfer in", ar: "تحويل وارد" },
  { value: "TRANSFER_OUT", en: "Transfer out", ar: "تحويل صادر" },
  { value: "ADJUSTMENT", en: "Adjustment", ar: "تسوية" },
] as const

export const NOTIFICATION_TYPES = [
  { value: "APPOINTMENT_UPCOMING", en: "Upcoming appointment", ar: "موعد قادم" },
  { value: "APPOINTMENT_CANCELLED", en: "Appointment cancelled", ar: "إلغاء موعد" },
  { value: "NO_SHOW", en: "No show", ar: "عدم حضور" },
  { value: "LOW_INVENTORY", en: "Low inventory", ar: "مخزون منخفض" },
  { value: "EXPIRING_INVENTORY", en: "Expiring inventory", ar: "مخزون منتهي" },
  { value: "OUTSTANDING_PAYMENT", en: "Outstanding payment", ar: "دفعة متأخرة" },
  { value: "OVERDUE_INSTALLMENT", en: "Overdue installment", ar: "قسط متأخر" },
  { value: "LAB_CASE", en: "Lab case", ar: "حالة مختبر" },
  { value: "IMPORTANT_PATIENT_EVENT", en: "Important patient event", ar: "حدث مريض مهم" },
] as const

// Condition visual-state metadata used by both 2D and 3D charts
export const CONDITION_VISUALS: Record<string, { color: string; icon: string; labelEn: string; labelAr: string }> = {
  HEALTHY: { color: "#e8eef5", icon: "✓", labelEn: "Healthy", labelAr: "سليم" },
  CARIES: { color: "#e58e44", icon: "●", labelEn: "Caries", labelAr: "تسوس" },
  DEEP_CARIES: { color: "#d35400", icon: "●", labelEn: "Deep caries", labelAr: "تسوس عميق" },
  FILLING: { color: "#7b9fd4", icon: "◍", labelEn: "Filling", labelAr: "حشوة" },
  FAILED_FILLING: { color: "#9b59b6", icon: "◍", labelEn: "Failed filling", labelAr: "حشوة تالفة" },
  CROWN: { color: "#c9a227", icon: "⌽", labelEn: "Crown", labelAr: "تاج" },
  BRIDGE: { color: "#a4792a", icon: "⌽⌽", labelEn: "Bridge", labelAr: "جسر" },
  IMPLANT: { color: "#3d8b6e", icon: "⚒", labelEn: "Implant", labelAr: "زرعة" },
  MISSING: { color: "#9aa5b1", icon: "✕", labelEn: "Missing", labelAr: "مفقود" },
  EXTRACTED: { color: "#6f7d8c", icon: "✕", labelEn: "Extracted", labelAr: "خلع" },
  ROOT_CANAL: { color: "#8e44ad", icon: "R", labelEn: "Root canal", labelAr: "علاج عصب" },
  ROOT_CANAL_NEEDED: { color: "#a55eea", icon: "R!", labelEn: "Root canal needed", labelAr: "يحتاج علاج عصب" },
  FRACTURE: { color: "#e74c3c", icon: "⚡", labelEn: "Fracture", labelAr: "كسر" },
  CRACK: { color: "#f1c40f", icon: "⚡", labelEn: "Crack", labelAr: "شرخ" },
  MOBILITY: { color: "#e67e22", icon: "↔", labelEn: "Mobility", labelAr: "حركة" },
  PERIODONTAL_ISSUE: { color: "#b03a2e", icon: "⌄", labelEn: "Periodontal", labelAr: "لثة" },
  ABSCESS: { color: "#c0392b", icon: "●", labelEn: "Abscess", labelAr: "خراج" },
  INFECTION: { color: "#e74c3c", icon: "●", labelEn: "Infection", labelAr: "التهاب" },
  IMPACTED: { color: "#34495e", icon: "◑", labelEn: "Impacted", labelAr: "مدفون" },
  RETAINED_PRIMARY_TOOTH: { color: "#d4a8c8", icon: "◐", labelEn: "Retained primary", labelAr: "سن لبنية" },
  WEAR: { color: "#dod9df", icon: "▽", labelEn: "Wear", labelAr: "تآكل" },
  EROSION: { color: "#bdc3c7", icon: "▽", labelEn: "Erosion", labelAr: "تآكل حمضي" },
  ABRASION: { color: "#95a5a6", icon: "▽", labelEn: "Abrasion", labelAr: "تآكل ميكانيكي" },
  DISCOLORATION: { color: "#8a6d3b", icon: "◌", labelEn: "Discoloration", labelAr: "تصبغ" },
  VENEER: { color: "#74b9ff", icon: "◌", labelEn: "Veneer", labelAr: "قشرة تجميلية" },
  SEALANT: { color: "#b8e994", icon: "◌", labelEn: "Sealant", labelAr: "مانع تسرب" },
  OTHER: { color: "#7f8c8d", icon: "?", labelEn: "Other", labelAr: "أخرى" },
}
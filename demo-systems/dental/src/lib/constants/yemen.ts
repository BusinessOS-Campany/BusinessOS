export const GOVERNORATES = [
  { en: "Sana'a", ar: "صنعاء" },
  { en: "Aden", ar: "عدن" },
  { en: "Taiz", ar: "تعز" },
  { en: "Al Hudaydah", ar: "الحديدة" },
  { en: "Ibb", ar: "إب" },
  { en: "Hadhramaut", ar: "حضرموت" },
  { en: "Dhamar", ar: "ذمار" },
  { en: "Hajjah", ar: "حجة" },
  { en: "Saada", ar: "صعدة" },
  { en: "Lahij", ar: "لحج" },
  { en: "Abyan", ar: "أبين" },
  { en: "Shabwah", ar: "شبوة" },
  { en: "Marib", ar: "مأرب" },
  { en: "Al Mahwit", ar: "المحويت" },
  { en: "Amran", ar: "عمران" },
  { en: "Al Bayda", ar: "البيضاء" },
  { en: "Al Jawf", ar: "الجوف" },
  { en: "Raymah", ar: "ريمة" },
  { en: "Socotra", ar: "سقطرى" },
] as const

export const NATIONALITIES = [
  "Yemeni",
  "Saudi",
  "Indian",
  "Bangladeshi",
  "Pakistani",
  "Syrian",
  "Egyptian",
  "Jordanian",
  "Iraqi",
  "Sudanese",
  "Somali",
  "Ethiopian",
  "Filipino",
  "Other",
] as const

export const MARITAL_OPTIONS = ["SINGLE", "MARRIED", "DIVORCED", "WIDOWED"] as const

export const GENDERS = ["MALE", "FEMALE"] as const

export const DENTIST_SPECIALTIES = [
  { value: "GENERAL", en: "General Dentistry", ar: "طب الأسنان العام" },
  { value: "ENDODONTICS", en: "Endodontics", ar: "علاج الجذور والأعصاب" },
  { value: "ORTHODONTICS", en: "Orthodontics", ar: "تقويم الأسنان" },
  { value: "PERIODONTICS", en: "Periodontics", ar: "علاج اللثة" },
  { value: "PROSTHODONTICS", en: "Prosthodontics", ar: "التعويضات السنية" },
  { value: "ORAL_SURGERY", en: "Oral Surgery", ar: "جراحة الفم" },
  { value: "PEDIATRIC", en: "Pediatric Dentistry", ar: "طب أسنان الأطفال" },
  { value: "COSMETIC", en: "Cosmetic Dentistry", ar: "طب الأسنان التجميلي" },
  { value: "IMPLANTOLOGY", en: "Implantology", ar: "زراعة الأسنان" },
] as const

export const EXPENSE_CATEGORIES = [
  { value: "RENT", en: "Rent", ar: "إيجار" },
  { value: "SALARIES", en: "Salaries", ar: "رواتب" },
  { value: "UTILITIES", en: "Utilities", ar: "خدمات" },
  { value: "DENTAL_MATERIALS", en: "Dental materials", ar: "مواد سنية" },
  { value: "LABORATORY", en: "Laboratory", ar: "مختبر" },
  { value: "EQUIPMENT", en: "Equipment", ar: "معدات" },
  { value: "MAINTENANCE", en: "Maintenance", ar: "صيانة" },
  { value: "MARKETING", en: "Marketing", ar: "تسويق" },
  { value: "OTHER", en: "Other", ar: "أخرى" },
] as const

export const PAYMENT_METHODS = [
  { value: "CASH", en: "Cash", ar: "نقدي" },
  { value: "BANK_TRANSFER", en: "Bank transfer", ar: "تحويل بنكي" },
  { value: "CARD", en: "Debit/Credit card", ar: "بطاقة" },
  { value: "MOBILE_WALLET", en: "Mobile wallet", ar: "محفظة إلكترونية" },
  { value: "OTHER", en: "Other", ar: "أخرى" },
] as const

export const IMAGING_TYPES = [
  { value: "XRAY_PANORAMIC", en: "Panoramic X-ray", ar: "صورة بانورامية" },
  { value: "XRAY_PERIAPICAL", en: "Periapical X-ray", ar: "صورة ذروية" },
  { value: "XRAY_BITEWING", en: "Bitewing X-ray", ar: "صورة عضة" },
  { value: "XRAY_CEPHALOMETRIC", en: "Cephalometric X-ray", ar: "صورة قياسية للجمجمة" },
  { value: "XRAY_CBCT", en: "CBCT", ar: "أشعة مقطعية CBCT" },
  { value: "INTRAORAL_PHOTO", en: "Intraoral photo", ar: "صورة داخل الفم" },
  { value: "EXTRAORAL_PHOTO", en: "Extraoral photo", ar: "صورة خارج الفم" },
  { value: "OTHER", en: "Other", ar: "أخرى" },
] as const

export const DOCUMENT_TYPES = [
  { value: "MEDICAL_REPORT", en: "Medical report", ar: "تقرير طبي" },
  { value: "REFERRAL_LETTER", en: "Referral letter", ar: "خطاب إحالة" },
  { value: "CONSENT_FORM", en: "Consent form", ar: "نموذج موافقة" },
  { value: "LAB_REPORT", en: "Lab report", ar: "تقرير مختبر" },
  { value: "XRAY", en: "X-ray", ar: "أشعة" },
  { value: "TREATMENT_DOCUMENT", en: "Treatment document", ar: "مستند علاج" },
  { value: "IDENTIFICATION", en: "Identification", ar: "وثيقة هوية" },
  { value: "OTHER", en: "Other", ar: "أخرى" },
] as const

export const CONSENT_TYPES = [
  { value: "TREATMENT", en: "Treatment consent", ar: "موافقة علاج" },
  { value: "SURGERY", en: "Surgery consent", ar: "موافقة جراحة" },
  { value: "EXTRACTION", en: "Extraction consent", ar: "موافقة خلع" },
  { value: "IMPLANT", en: "Implant consent", ar: "موافقة زراعة" },
  { value: "ROOT_CANAL", en: "Root canal consent", ar: "موافقة علاج عصب" },
  { value: "ANESTHESIA", en: "Anesthesia consent", ar: "موافقة تخدير" },
  { value: "PRIVACY", en: "Privacy consent", ar: "موافقة الخصوصية" },
  { value: "CUSTOM", en: "Custom consent", ar: "موافقة مخصصة" },
] as const
import type { Locale } from "@/lib/i18n"

export const INVOICE_STATUSES = [
  "DRAFT",
  "ISSUED",
  "PARTIALLY_PAID",
  "PAID",
  "CANCELLED",
  "REFUNDED",
] as const
export type InvoiceStatusValue = (typeof INVOICE_STATUSES)[number]

export const PAYMENT_METHODS = [
  "CASH",
  "BANK_TRANSFER",
  "CARD",
  "MOBILE_WALLET",
  "OTHER",
] as const
export type PaymentMethodValue = (typeof PAYMENT_METHODS)[number]

export const INSTALLMENT_STATUSES = ["PENDING", "PAID", "OVERDUE", "CANCELLED"] as const
export type InstallmentStatusValue = (typeof INSTALLMENT_STATUSES)[number]

export const EXPENSE_CATEGORIES = [
  "RENT",
  "SALARIES",
  "UTILITIES",
  "DENTAL_MATERIALS",
  "LABORATORY",
  "EQUIPMENT",
  "MAINTENANCE",
  "MARKETING",
  "OTHER",
] as const
export type ExpenseCategoryValue = (typeof EXPENSE_CATEGORIES)[number]

const invoiceStatusEn: Record<InvoiceStatusValue, string> = {
  DRAFT: "Draft",
  ISSUED: "Issued",
  PARTIALLY_PAID: "Partially paid",
  PAID: "Paid",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
}
const invoiceStatusAr: Record<InvoiceStatusValue, string> = {
  DRAFT: "مسودة",
  ISSUED: "صادرة",
  PARTIALLY_PAID: "مدفوعة جزئياً",
  PAID: "مدفوعة",
  CANCELLED: "ملغاة",
  REFUNDED: "مستردة",
}

export function invoiceStatusLabel(status: string, locale: Locale): string {
  const s = status as InvoiceStatusValue
  return locale === "ar" ? invoiceStatusAr[s] ?? status : invoiceStatusEn[s] ?? status
}

const methodEn: Record<PaymentMethodValue, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer",
  CARD: "Card",
  MOBILE_WALLET: "Mobile wallet",
  OTHER: "Other",
}
const methodAr: Record<PaymentMethodValue, string> = {
  CASH: "نقدي",
  BANK_TRANSFER: "تحويل بنكي",
  CARD: "بطاقة",
  MOBILE_WALLET: "محفظة جوال",
  OTHER: "أخرى",
}

export function paymentMethodLabel(method: string, locale: Locale): string {
  const m = method as PaymentMethodValue
  return locale === "ar" ? methodAr[m] ?? method : methodEn[m] ?? method
}

const installmentStatusEn: Record<InstallmentStatusValue, string> = {
  PENDING: "Pending",
  PAID: "Paid",
  OVERDUE: "Overdue",
  CANCELLED: "Cancelled",
}
const installmentStatusAr: Record<InstallmentStatusValue, string> = {
  PENDING: "قيد الانتظار",
  PAID: "مدفوع",
  OVERDUE: "متأخر",
  CANCELLED: "ملغي",
}

export function installmentStatusLabel(status: string, locale: Locale): string {
  const s = status as InstallmentStatusValue
  return locale === "ar" ? installmentStatusAr[s] ?? status : installmentStatusEn[s] ?? status
}

const categoryEn: Record<ExpenseCategoryValue, string> = {
  RENT: "Rent",
  SALARIES: "Salaries",
  UTILITIES: "Utilities",
  DENTAL_MATERIALS: "Dental materials",
  LABORATORY: "Laboratory",
  EQUIPMENT: "Equipment",
  MAINTENANCE: "Maintenance",
  MARKETING: "Marketing",
  OTHER: "Other",
}
const categoryAr: Record<ExpenseCategoryValue, string> = {
  RENT: "إيجار",
  SALARIES: "رواتب",
  UTILITIES: "مرافق",
  DENTAL_MATERIALS: "مواد طب أسنان",
  LABORATORY: "مختبر",
  EQUIPMENT: "معدات",
  MAINTENANCE: "صيانة",
  MARKETING: "تسويق",
  OTHER: "أخرى",
}

export function expenseCategoryLabel(category: string, locale: Locale): string {
  const c = category as ExpenseCategoryValue
  return locale === "ar" ? categoryAr[c] ?? category : categoryEn[c] ?? category
}
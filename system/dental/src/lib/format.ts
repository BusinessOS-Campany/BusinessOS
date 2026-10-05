type Money = number | string | null | undefined | { toString(): string }

export function formatCurrency(amount: Money, currency = "YER"): string {
  const value = typeof amount === "number" ? amount : Number(String(amount ?? 0))
  const formatted = new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value)
  if (currency === "YER") return `${formatted} ريال`
  if (currency === "SAR") return `${formatted} ر.س`
  if (currency === "USD") return `$${formatted}`
  if (currency === "AED") return `${formatted} د.إ`
  return `${formatted} ${currency}`
}

export function formatNumber(value: number | string | null | undefined): string {
  const num = typeof value === "number" ? value : Number(value ?? 0)
  return new Intl.NumberFormat("en-US").format(num)
}

export function formatDate(date: Date | string | null | undefined, lang: "ar" | "en" = "en"): string {
  if (!date) return "—"
  const d = typeof date === "string" ? new Date(date) : date
  if (lang === "ar") {
    return d.toLocaleDateString("ar-YE", { year: "numeric", month: "long", day: "numeric" })
  }
  return d.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric" })
}

export function formatDateTime(date: Date | string | null | undefined, lang: "ar" | "en" = "en"): string {
  if (!date) return "—"
  const d = typeof date === "string" ? new Date(date) : date
  if (lang === "ar") {
    return d.toLocaleString("ar-YE", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })
  }
  return d.toLocaleString("en-GB", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

export function timeAgo(date: Date | string, lang: "ar" | "en" = "en"): string {
  const d = typeof date === "string" ? new Date(date) : date
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000)
  const intervals: [number, string, string][] = [
    [60, "minute", "دقيقة"],
    [3600, "hour", "ساعة"],
    [86400, "day", "يوم"],
    [604800, "week", "أسبوع"],
    [2592000, "month", "شهر"],
    [31536000, "year", "سنة"],
  ]
  if (seconds < 60) return lang === "ar" ? "الآن" : "just now"
  let value = seconds
  let unit = "second"
  let arUnit = "ثانية"
  for (const [limit, en, ar] of intervals) {
    if (seconds < limit) break
    value = Math.floor(seconds / limit)
    unit = en
    arUnit = ar
  }
  if (lang === "ar") return `منذ ${value} ${value === 1 ? "الـ" : value === 2 ? "" : ""}${arUnit}${value > 2 ? "ات" : ""}`.replace(/\s{2,}/g, " ")
  if (value === 1) return `1 ${unit} ago`
  return `${value} ${unit}s ago`
}

export function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number)
  const d = new Date()
  d.setHours(h ?? 0, m ?? 0, 0, 0)
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })
}

export function waitDuration(from: Date | string, to: Date | string): string {
  const f = typeof from === "string" ? new Date(from) : from
  const t = typeof to === "string" ? new Date(to) : to
  const mins = Math.max(0, Math.floor((t.getTime() - f.getTime()) / 60000))
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

export function calcAge(dateOfBirth: Date | string | null | undefined): number | null {
  if (!dateOfBirth) return null
  const dob = typeof dateOfBirth === "string" ? new Date(dateOfBirth) : dateOfBirth
  const diff = Date.now() - dob.getTime()
  return Math.floor(diff / (365.25 * 24 * 3600 * 1000))
}
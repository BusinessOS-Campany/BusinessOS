import type { Locale } from "@/lib/i18n";

// Money is stored as BigInt minor units: 1 YER = 100 minor.

export const MINOR_PER_UNIT = 100;

export function toMinor(value: number | string): bigint {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (!Number.isFinite(n)) return 0n;
  return BigInt(Math.round(n * MINOR_PER_UNIT));
}

export function fromMinor(minor: bigint | number): number {
  const n = typeof minor === "bigint" ? Number(minor) : minor;
  return n / MINOR_PER_UNIT;
}

export function fmtMoney(
  minor: bigint | number | null | undefined,
  locale: Locale = "ar"
): string {
  if (minor === null || minor === undefined) minor = 0n;
  const num = fromMinor(minor);
  const formatted = num.toLocaleString(locale === "ar" ? "en-US" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return locale === "ar" ? `${formatted} ر.ي` : `${formatted} YER`;
}

export function fmtNumber(
  value: number | string | null | undefined,
  locale: Locale = "ar",
  digits = 0
): string {
  if (value === null || value === undefined) return "";
  const n = typeof value === "string" ? parseFloat(value) : value;
  return n.toLocaleString(locale === "ar" ? "en-US" : "en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtQty(
  value: number | string | null | undefined
): string {
  if (value === null || value === undefined) return "";
  const n = typeof value === "string" ? parseFloat(value) : value;
  return n.toLocaleString("en-US", { maximumFractionDigits: 3 });
}

export function fmtDate(
  date: Date | string | null | undefined,
  locale: Locale = "ar"
): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString(locale === "ar" ? "ar-YE" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function fmtDateTime(
  date: Date | string | null | undefined,
  locale: Locale = "ar"
): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString(locale === "ar" ? "ar-YE" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtMinorToUnit(minor: bigint | number): string {
  return fromMinor(minor).toString();
}

export function todayStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function monthStart(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function formatArabicDigits(n: number | string): string {
  const digits = "٠١٢٣٤٥٦٧٨٩";
  return String(n).replace(/[0-9]/g, (d) => digits[Number(d)]);
}
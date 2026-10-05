import type { Locale } from "@/core/i18n/dictionaries";

/**
 * Locale-aware display helpers for the profile surface.
 *
 * Isomorphic on purpose: the same functions run in the server components that
 * render the initial payload and in the client components that re-render after a
 * mutation, so a value never changes shape or wording between the two passes.
 *
 * Digits: Arabic is forced to Latin digits (`-u-nu-latn`) on purpose. The rest
 * of Business OS renders prices, quantities and dates with Latin digits, and
 * mixing Arabic-Indic digits into the profile next to Latin ones in the same
 * card reads as a bug. Month/day names still localise.
 */

const tag = (locale: Locale) => (locale === "ar" ? "ar-u-nu-latn" : "en-GB");

export function formatNumber(value: number, locale: Locale): string {
  try {
    return new Intl.NumberFormat(tag(locale)).format(value);
  } catch {
    return String(value);
  }
}

export function formatDate(iso: string | Date | null | undefined, locale: Locale): string | null {
  if (!iso) return null;
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(tag(locale), {
      year: "numeric",
      month: "short",
      day: "numeric",
      calendar: "gregory",
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export function formatDateTime(iso: string | Date | null | undefined, locale: Locale): string | null {
  if (!iso) return null;
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(tag(locale), {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      calendar: "gregory",
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600_000],
  ["month", 30 * 24 * 3600_000],
  ["week", 7 * 24 * 3600_000],
  ["day", 24 * 3600_000],
  ["hour", 3600_000],
  ["minute", 60_000],
];

/** "3 days ago" / "قبل ٣ أيام" — falls back to an absolute date beyond a year. */
export function formatRelative(iso: string | Date | null | undefined, locale: Locale): string | null {
  if (!iso) return null;
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const diff = d.getTime() - Date.now();
  const abs = Math.abs(diff);
  if (abs < 60_000) return null; // "just now" is noise on a profile
  try {
    const rtf = new Intl.RelativeTimeFormat(tag(locale), { numeric: "auto" });
    for (const [unit, ms] of UNITS) {
      if (abs >= ms) return rtf.format(Math.round(diff / ms), unit);
    }
    return rtf.format(Math.round(diff / 60_000), "minute");
  } catch {
    return formatDate(d, locale);
  }
}

export function formatBytes(bytes: number, locale: Locale): string {
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const n = i === 0 ? String(Math.round(v)) : v.toFixed(v < 10 ? 1 : 0);
  return `${formatNumber(Number(n), locale)} ${units[i]}`;
}

/** Up to two leading characters for avatar fallbacks. Works for Arabic and Latin. */
export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return [...parts[0]].slice(0, 2).join("");
  return `${[...parts[0]][0] ?? ""}${[...parts[parts.length - 1]][0] ?? ""}`;
}

/**
 * Best-effort browser/OS name from a raw user-agent string. Deliberately
 * conservative: it returns null rather than guessing, so the UI can fall back
 * to a generic device label instead of showing something wrong.
 */
export function describeUserAgent(ua: string | null | undefined): { os: string | null; browser: string | null } {
  if (!ua || ua.trim() === "") return { os: null, browser: null };
  const s = ua;
  const os = /Windows NT 10/i.test(s)
    ? "Windows 10/11"
    : /Windows/i.test(s)
      ? "Windows"
      : /iPhone|iPad|iPod/i.test(s)
        ? "iOS"
        : /Android/i.test(s)
          ? "Android"
          : /Mac OS X|Macintosh/i.test(s)
            ? "macOS"
            : /CrOS/i.test(s)
              ? "ChromeOS"
              : /Linux/i.test(s)
                ? "Linux"
                : null;
  const browser = /Edg\//i.test(s)
    ? "Edge"
    : /OPR\//i.test(s)
      ? "Opera"
      : /Firefox\//i.test(s)
        ? "Firefox"
        : /Chrome\//i.test(s)
          ? "Chrome"
          : /Safari\//i.test(s)
            ? "Safari"
            : null;
  return { os, browser };
}

/** `0000:0000:...` is the anonymised address this stack stores behind a proxy. */
export function isRealIp(ip: string | null | undefined): boolean {
  if (!ip) return false;
  const v = ip.trim();
  if (v === "") return false;
  if (/^unknown$/i.test(v)) return false;
  // Loopback and unspecified, in both families. A session showing 127.0.0.1 is a
  // local dev request, not a device the owner would recognise.
  if (v === "::" || v === "::1" || /^0{1,4}(:0{1,4}){7}$/.test(v)) return false;
  if (v === "0.0.0.0") return false;
  // IPv4 private / loopback / link-local ranges, kept in RFC1918+169.254 shape.
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(v);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 127) return false;
    if (a === 10) return false;
    if (a === 192 && b === 168) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 169 && b === 254) return false;
    if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
  }
  // IPv6 unique-local (fc00::/7) and link-local (fe80::/10).
  if (/^f[cd][0-9a-f]{2}:/.test(v)) return false;
  if (/^fe[89ab][0-9a-f]:/.test(v)) return false;
  return true;
}

/**
 * Pure validation/normalisation for everything the profile editor can write.
 *
 * Isomorphic: the client runs it for instant feedback and the server runs the
 * exact same code before touching the database, so the UI can never drift from
 * what the API actually accepts. The server call is the one that counts.
 *
 * `user.socials`, `user.profileExtras` and `user.preferences` are untyped
 * jsonb columns that predate this module and have never been written by the
 * app, so every read is treated as untrusted input.
 */

/* ── text ────────────────────────────────────────────────────────────────── */

// C0/C1 controls, the zero-width and bidi ranges, and the deprecated format
// characters. The bidi block matters: U+202E is the classic "exe.txt" -> "txt.exe"
// spoof, and it is invisible to the human reading the value.
const CONTROL_CHARS =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]/g;

/** Trim, drop control/zero-width characters, collapse runs of whitespace. */
export function sanitizeText(raw: unknown, max: number): string {
  if (typeof raw !== "string") return "";
  return raw.replace(CONTROL_CHARS, "").replace(/\s+/g, " ").trim().slice(0, max);
}

/** Like sanitizeText but keeps newlines, for the bio field. */
export function sanitizeMultiline(raw: unknown, max: number): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(CONTROL_CHARS, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

export const LIMITS = {
  name: 60,
  bio: 500,
  jobTitle: 80,
  location: 80,
  city: 60,
  linkLabel: 40,
  url: 300,
  socialLinks: 10,
  usernameMin: 3,
  usernameMax: 30,
} as const;

/* ── name ────────────────────────────────────────────────────────────────── */

/**
 * `user.name` is the single source of truth for a person's name — there are no
 * first/last columns and this module does not add any. The editor edits the full
 * name; the two parts are derived for display only.
 */
export function splitName(name: string | null | undefined): { firstName: string; lastName: string } {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") };
}

export function joinName(first: string, last: string): string {
  return sanitizeText(`${first} ${last}`, LIMITS.name);
}

/* ── username ────────────────────────────────────────────────────────────── */

const USERNAME_RE = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;

export type UsernameResult = { ok: true; value: string } | { ok: false; reason: "empty" | "invalid" | "tooShort" | "tooLong" };

/**
 * Handles are stored lower-cased, which is what makes the plain UNIQUE index
 * sufficient — see the CHECK constraint added in the profile_username_cover
 * migration. A leading `@` is stripped so pasting "@ahmed" just works.
 *
 * Not a login identifier: sign-in is email-or-phone only.
 */
export function normalizeUsername(raw: unknown): UsernameResult {
  if (typeof raw !== "string") return { ok: false, reason: "empty" };
  const value = raw.trim().replace(/^@+/, "").toLowerCase();
  if (value === "") return { ok: false, reason: "empty" };
  if (value.length < LIMITS.usernameMin) return { ok: false, reason: "tooShort" };
  if (value.length > LIMITS.usernameMax) return { ok: false, reason: "tooLong" };
  if (!USERNAME_RE.test(value)) return { ok: false, reason: "invalid" };
  return { ok: true, value };
}

/* ── urls ────────────────────────────────────────────────────────────────── */

/**
 * Only http(s) survives. `javascript:`, `data:`, `vbscript:` and friends are
 * rejected outright rather than coerced, because these values end up in `href`
 * attributes on the profile.
 */
export function normalizeUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = sanitizeText(raw, LIMITS.url);
  if (trimmed === "") return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname || !url.hostname.includes(".")) return null;
  return url.toString().slice(0, LIMITS.url);
}

/* ── socials (user.socials jsonb) ─────────────────────────────────────────── */

export const SOCIAL_KEYS = ["website", "github", "linkedin", "twitter", "facebook", "instagram"] as const;
export type SocialKey = (typeof SOCIAL_KEYS)[number];

export interface SocialLink {
  id: string;
  label: string;
  url: string;
}

export interface Socials {
  website: string | null;
  github: string | null;
  linkedin: string | null;
  twitter: string | null;
  facebook: string | null;
  instagram: string | null;
  links: SocialLink[];
}

export const EMPTY_SOCIALS: Socials = {
  website: null,
  github: null,
  linkedin: null,
  twitter: null,
  facebook: null,
  instagram: null,
  links: [],
};

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** Reads the jsonb column defensively: unknown keys dropped, bad urls nulled. */
export function normalizeSocials(raw: unknown): Socials {
  const r = asRecord(raw);
  const out: Socials = { ...EMPTY_SOCIALS };
  for (const key of SOCIAL_KEYS) {
    out[key] = normalizeUrl(r[key]);
  }
  const links = Array.isArray(r.links) ? r.links.slice(0, LIMITS.socialLinks) : [];
  out.links = links
    .map((l, i) => {
      const rec = asRecord(l);
      const url = normalizeUrl(rec.url);
      if (!url) return null;
      const label = sanitizeText(rec.label, LIMITS.linkLabel);
      return { id: sanitizeText(rec.id, 40) || `link-${i}`, label, url };
    })
    .filter((l): l is SocialLink => l !== null);
  return out;
}

/* ── profile extras (user.profile_extras jsonb) ───────────────────────────── */

export interface ProfileExtras {
  jobTitle: string | null;
  location: string | null;
  city: string | null;
}

export const EMPTY_EXTRAS: ProfileExtras = { jobTitle: null, location: null, city: null };

export function normalizeExtras(raw: unknown): ProfileExtras {
  const r = asRecord(raw);
  return {
    jobTitle: sanitizeText(r.jobTitle, LIMITS.jobTitle) || null,
    location: sanitizeText(r.location, LIMITS.location) || null,
    city: sanitizeText(r.city, LIMITS.city) || null,
  };
}

/* ── preferences (user.preferences jsonb) ────────────────────────────────── */

export interface Preferences {
  emailNotifications: boolean;
  marketing: boolean;
  aiAssist: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  emailNotifications: true,
  marketing: false,
  aiAssist: true,
};

export function normalizePreferences(raw: unknown): Preferences {
  const r = asRecord(raw);
  return {
    emailNotifications: typeof r.emailNotifications === "boolean" ? r.emailNotifications : DEFAULT_PREFERENCES.emailNotifications,
    marketing: typeof r.marketing === "boolean" ? r.marketing : DEFAULT_PREFERENCES.marketing,
    aiAssist: typeof r.aiAssist === "boolean" ? r.aiAssist : DEFAULT_PREFERENCES.aiAssist,
  };
}

/* ── media paths ─────────────────────────────────────────────────────────── */

/** Only same-origin API paths or absolute https URLs may be stored. */
export function normalizeMediaRef(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = sanitizeText(raw, 500);
  if (v === "") return null;
  // A stored ref is rendered as an <img src>, so it must be one of our own
  // media endpoints and nothing else: no traversal, no query, no fragment,
  // no protocol-relative "//host" trick, no backslashes. Absolute URLs are
  // refused too - otherwise a client could park an avatar on an arbitrary
  // third-party host and have us render a remote tracking pixel in place of a
  // private asset. The uploader only ever writes the relative form, so this
  // costs nothing.
  if (!/^\/api\/v1\/profile\/(avatar|cover)$/.test(v)) return null;
  return v;
}

import { t, type Dictionary, type Locale } from "@/core/i18n/dictionaries";
import { flagEmoji } from "@/core/auth/identifier";

/**
 * Presentation helpers for audit actions, membership roles and system states.
 * Kept pure and free of React so they can be unit-tested and reused by both the
 * timeline and any future export.
 */

/**
 * Audit actions are stored as `<domain>.<verb>` but a dot cannot appear in a
 * dot-path lookup, so the action is flattened before lookup. Unknown actions —
 * including any the server adds later — fall back to a humanised version of the
 * raw string instead of leaking a key path into the UI.
 */
export function activityLabel(dict: Dictionary, action: string): string {
  const key = `profile.activity.actions.${action.replace(/\./g, "_")}`;
  const found = t(dict, key);
  if (found !== key) return found;
  const tail = action.split(".").pop() ?? action;
  return tail.replace(/[_.]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

const ROLE_KEYS = new Set(["owner", "admin", "manager", "cashier", "accountant", "viewer"]);

/** Membership roles reuse the platform console's translated role names. */
export function roleLabel(dict: Dictionary, role: string): string {
  const key = `platform.tenantDetail.roles.${role}`;
  if (ROLE_KEYS.has(role)) {
    const found = t(dict, key);
    if (found !== key) return found;
  }
  return role.charAt(0).toUpperCase() + role.slice(1);
}

const ORG_STATUS: Record<string, { dictKey: string; tone: string }> = {
  active: { dictKey: "profile.account.statusActive", tone: "success" },
  pending: { dictKey: "profile.account.statusPending", tone: "warning" },
  suspended: { dictKey: "profile.account.statusSuspended", tone: "danger" },
  rejected: { dictKey: "profile.account.statusRejected", tone: "danger" },
  disabled: { dictKey: "profile.account.statusDisabled", tone: "neutral" },
};

export function orgStatus(dict: Dictionary, status: string): { label: string; tone: string } {
  const spec = ORG_STATUS[status];
  if (!spec) return { label: status.charAt(0).toUpperCase() + status.slice(1), tone: "neutral" };
  return { label: t(dict, spec.dictKey), tone: spec.tone };
}

/** System install states reuse the organization statuses plus "revoked". */
const SYSTEM_STATUS: Record<string, string> = {
  active: "profile.account.statusActive",
  pending: "profile.account.statusPending",
  suspended: "profile.account.statusSuspended",
  disabled: "profile.account.statusDisabled",
  revoked: "profile.security.revoke",
};

export function systemStatus(dict: Dictionary, status: string): { label: string; tone: string } {
  const key = SYSTEM_STATUS[status];
  if (!key) return { label: status.charAt(0).toUpperCase() + status.slice(1), tone: "neutral" };
  const tone = status === "active" ? "success" : status === "pending" ? "warning" : "neutral";
  return { label: t(dict, key), tone };
}

export function countryFlag(code: string | null | undefined): string {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return "🏳️";
  return flagEmoji(code.toUpperCase());
}

/** English country name from an ISO code, for the en locale. */
export function countryName(code: string | null | undefined, locale: Locale, fallback: string | null): string | null {
  if (!code) return fallback;
  if (locale === "ar") return fallback;
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) ?? fallback;
  } catch {
    return fallback;
  }
}

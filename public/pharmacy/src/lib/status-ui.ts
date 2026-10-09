import type { Locale } from "@/lib/i18n";
import { fmtDate, fmtMoney, fmtNumber } from "@/lib/format";

export type StatusKind =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral";

export function statusKindFor(kind: StatusKind): string {
  switch (kind) {
    case "success":
      return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20";
    case "warning":
      return "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20";
    case "danger":
      return "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20";
    case "info":
      return "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

export function batchStatus(date: Date | null | undefined): StatusKind {
  if (!date) return "neutral";
  const now = new Date();
  const days = (date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (days < 0) return "danger";
  if (days <= 60) return "warning";
  return "success";
}
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getT } from "@/shared/i18n";
import { getStoreSettings } from "@/features/settings/service";
import { formatDateTime, formatDate } from "@/shared/core/format";
import { ExportButton } from "@/features/inventory/ui/export-csv-button";
import { exportReportAction } from "../actions";
import { PdfButton, PrintButton } from "./print-button";

/** Shared report page: screen toolbar (export/PDF/dates, outside the paper) + a styled A4 paper captured for the PDF. */
export async function ReportHeader({
  title,
  basePath,
  family,
  fromISO,
  toISO,
  children,
}: {
  title: string;
  basePath: string;
  family: string;
  fromISO: string;
  toISO: string;
  children: React.ReactNode;
}) {
  const { t, locale } = await getT();
  const store = await getStoreSettings();
  const storeName = store?.name ?? store?.nameAr ?? "";
  const storeNameAr = store?.nameAr ?? store?.name ?? "";
  const storeLetter = (store?.name ?? store?.nameAr ?? "S").trim().charAt(0) || "S";
  const fromLabel = formatDate(fromISO, locale);
  const toLabel = formatDate(toISO, locale);
  const generatedAt = formatDateTime(new Date(), locale);
  const exportAction = exportReportAction.bind(null, family, fromISO, toISO);
  const printHref = family === "sales"
    ? `/api/reports/print?from=${encodeURIComponent(fromISO)}&to=${encodeURIComponent(toISO)}`
    : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <h2 className="sr-only">{t.common.export}</h2>
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <ExportButton action={exportAction} filename={`${family}-report`} label={t.common.export} />
          <PrintButton label={t.common.print} printHref={printHref} />
          <PdfButton label={t.common.pdf} />
        </div>
      </div>
      <form method="GET" action={basePath} className="flex flex-wrap items-end gap-2 print:hidden">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">{t.common.from}</label>
          <Input type="date" name="from" defaultValue={fromISO} className="w-40" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">{t.common.to}</label>
          <Input type="date" name="to" defaultValue={toISO} className="w-40" />
        </div>
        <Button type="submit" size="sm">{t.common.confirm}</Button>
        <Link href={basePath} className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          {t.common.reset}
        </Link>
      </form>

      {/* The document — sole content captured by the PDF */}
      <div id="pdf-paper" className="space-y-4">
        <header className="overflow-hidden rounded-xl border bg-background">
          {/* Dark gradient band: English store name (LTR) left, logo letter center, Arabic name right */}
          <div className="sama-head flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="min-w-0 flex-1 text-start" dir="ltr">
              <p className="sama-en truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-white/80 sm:text-xs">{storeName}</p>
            </div>
            <div className="sama-logo flex size-10 shrink-0 items-center justify-center rounded-full border-2 text-lg font-extrabold text-white sm:size-11">
              {storeLetter}
            </div>
            <div className="min-w-0 flex-1 text-end">
              <p className="sama-ar truncate text-xs font-bold text-white sm:text-sm">{storeNameAr}</p>
            </div>
          </div>
          {/* Purple title band with golden underline */}
          <div className="sama-title-wrap">
            <div className="sama-title px-4 py-2.5 text-center text-white">
              <p className="text-sm font-extrabold sm:text-base">{title}</p>
              <p className="sama-period mt-0.5 text-[10px] font-semibold text-white/90 sm:text-xs">
                {t.reports.csv.period}: <bdi dir="ltr">{fromLabel} ← {toLabel}</bdi>
              </p>
            </div>
          </div>
        </header>

        {children}

        <footer className="sama-footer flex items-end justify-between gap-4 px-6 pb-6 pt-10">
          <div className="flex-1 text-center">
            <span className="sama-sign-line" aria-hidden="true" />
            <p className="sama-sign-label mt-1.5 text-[11px] font-bold text-slate-600">{t.reports.signManagement}</p>
          </div>
          <div className="flex-1 text-center">
            <p className="text-xs font-bold text-slate-700">{storeNameAr}</p>
            <p className="mt-0.5 text-[10px] text-slate-500" dir="ltr">{generatedAt}</p>
          </div>
          <div className="flex-1 text-center">
            <span className="sama-sign-line" aria-hidden="true" />
            <p className="sama-sign-label mt-1.5 text-[11px] font-bold text-slate-600">{t.reports.signSecretary}</p>
          </div>
        </footer>
      </div>
    </div>
  );
}

export function SummaryCards({ items }: { items: { label: string; value: string; accent?: boolean }[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 print:hidden">
      {items.map((s) => (
        <Card key={s.label} className={s.accent ? "border-primary/40 bg-primary/5" : undefined}>
          <CardContent className="px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
            <p className={`mt-1 text-lg font-bold tabular-nums ${s.accent ? "text-primary" : ""}`} dir="ltr">
              {s.value}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="px-0 pb-0">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

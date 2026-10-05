"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { t, type Dictionary, type Locale } from "@/core/i18n/dictionaries";
import { formatDateTime, formatNumber, formatRelative } from "@/core/profile/format";
import { activityLabel } from "./labels";
import type { ProfileActivity as ActivityData } from "@/core/profile/types";
import type { ProfileController } from "./use-profile";

/**
 * Activity tab: a 52-week contribution heatmap plus a paginated timeline.
 *
 * The heatmap is CSS-grid rather than SVG so the 364 cells stay accessible
 * (each one carries a `title`/`aria-label` with the real date and count) and
 * need no layout measurement on the client.
 */

const LEVEL_CLASSES = [
  "bg-border/50",
  "bg-primary/25",
  "bg-primary/45",
  "bg-primary/70",
  "bg-primary",
] as const;

interface Props {
  dict: Dictionary;
  locale: Locale;
  activity: ActivityData | null;
  loading: boolean;
  error: string | null;
  page: number;
  controller: ProfileController;
}

export function ProfileActivityPanel({ dict, locale, activity, loading, error, page, controller }: Props) {
  if (error) {
    return (
      <Card>
        <CardContent className="space-y-3 p-6 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button size="sm" variant="outline" onClick={() => void controller.loadActivity(1)}>
            {t(dict, "common.retry")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!activity) {
    return (
      <div className="grid gap-3" aria-busy="true">
        <div className="h-24 animate-pulse rounded-xl bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
        <p className="text-center text-sm text-muted-foreground">{t(dict, "profile.activity.loading")}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {/* Headline numbers */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label={t(dict, "profile.activity.total")} value={formatNumber(activity.total, locale)} />
        <Metric
          label={t(dict, "profile.activity.streak")}
          value={formatNumber(activity.currentStreak, locale)}
          hint={
            activity.longestStreak > activity.currentStreak
              ? `${t(dict, "profile.activity.best")}: ${formatNumber(activity.longestStreak, locale)}`
              : undefined
          }
        />
        <Metric
          label={t(dict, "profile.activity.busiest")}
          value={activity.busiest ? formatNumber(activity.busiest.count, locale) : "—"}
          hint={activity.busiest ? formatDateTime(`${activity.busiest.date}T00:00:00Z`, locale) ?? undefined : undefined}
        />
        <Metric
          label={t(dict, "profile.activity.dailyAvg")}
          value={formatNumber(Math.round(activity.total / 52 / 7), locale)}
          hint={t(dict, "profile.activity.dailyAvgHint")}
        />
      </div>

      {/* Heatmap */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t(dict, "profile.activity.heatmapLabel")}</CardTitle>
          <CardDescription>{t(dict, "profile.activity.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Heatmap dict={dict} locale={locale} days={activity.days} maxDay={activity.maxDay} />
          <div className="mt-3 flex items-center justify-end gap-1.5">
            <span className="text-[10px] text-muted-foreground">{t(dict, "profile.activity.less")}</span>
            {LEVEL_CLASSES.map((cls, i) => (
              <span key={i} aria-hidden className={cn("size-3 rounded-sm", cls)} />
            ))}
            <span className="text-[10px] text-muted-foreground">{t(dict, "profile.activity.more")}</span>
          </div>
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t(dict, "profile.activity.recent")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {activity.items.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm font-medium text-foreground">{t(dict, "profile.activity.empty")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t(dict, "profile.activity.emptyHint")}</p>
            </div>
          ) : (
            <ol className="relative space-y-0.5">
              {activity.items.map((item) => (
                <li key={item.id} className="flex items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60">
                  <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-primary/70" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{activityLabel(dict, item.action)}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.organizationName ?? t(dict, "profile.activity.platform")}
                      {item.entityType ? ` · ${item.entityType}` : ""}
                    </p>
                  </div>
                  <time
                    dateTime={item.at}
                    title={formatDateTime(item.at, locale) ?? undefined}
                    className="shrink-0 text-xs text-muted-foreground"
                  >
                    {formatRelative(item.at, locale)}
                  </time>
                </li>
              ))}
            </ol>
          )}

          {activity.hasMore ? (
            <div className="flex justify-center pt-3">
              <Button
                size="sm"
                variant="outline"
                disabled={loading}
                onClick={() => void controller.loadActivity(page + 1, true)}
              >
                {loading ? t(dict, "profile.activity.loading") : t(dict, "profile.activity.loadMore")}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{value}</p>
        {hint ? <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

/**
 * Columns are weeks, rows are weekdays (Sun→Sat). The service returns a dense
 * ascending list ending today, so it is chunked into columns of 7; the trailing
 * partial column is padded with empty cells to keep the grid rectangular.
 */
function Heatmap({
  dict,
  locale,
  days,
  maxDay,
}: {
  dict: Dictionary;
  locale: Locale;
  days: { date: string; count: number }[];
  maxDay: number;
}) {
  const { columns, monthLabels } = useMemo(() => {
    const cells: ({ date: string; count: number } | null)[] = days.map((d) => d);
    while (cells.length % 7 !== 0) cells.push(null);

    const cols: ({ date: string; count: number } | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) cols.push(cells.slice(i, i + 7));

    // Label a column only when its first day opens a new month.
    const labels = cols.map((col) => {
      const first = col.find((c): c is { date: string; count: number } => c !== null);
      if (!first) return null;
      const d = new Date(`${first.date}T00:00:00Z`);
      const prev = col.length > 1 ? d : null;
      void prev;
      return d;
    });
    const seen = new Set<string>();
    return {
      columns: cols,
      monthLabels: labels.map((d) => {
        if (!d) return null;
        const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
        if (seen.has(key)) return null;
        seen.add(key);
        return new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", { month: "short", timeZone: "UTC" }).format(d);
      }),
    };
  }, [days, locale]);

  const level = (count: number) => {
    if (count === 0) return 0;
    if (maxDay <= 0) return 1;
    const ratio = count / maxDay;
    if (ratio <= 0.25) return 1;
    if (ratio <= 0.5) return 2;
    if (ratio <= 0.75) return 3;
    return 4;
  };

  return (
    <div className="overflow-x-auto pb-1">
      <div className="inline-block min-w-full" dir="ltr">
        {/* Month scale */}
        <div className="mb-1 flex gap-[3px] pl-[22px]" aria-hidden>
          {columns.map((col, i) => (
            <div key={i} className="w-[11px] shrink-0 text-[9px] leading-3 text-muted-foreground">
              {monthLabels[i] && i % 4 === 0 ? monthLabels[i] : ""}
            </div>
          ))}
        </div>

        <div className="flex gap-[3px]">
          {/* Weekday scale */}
          <div className="flex w-[22px] shrink-0 flex-col gap-[3px]" aria-hidden>
            {[1, 3, 5].map((row) => (
              <span
                key={row}
                className="h-[11px] text-[9px] leading-[11px] text-muted-foreground"
              >
                {new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", { weekday: "short" }).format(
                  new Date(2024, 0, 7 + row),
                )}
              </span>
            ))}
          </div>

          {columns.map((col, ci) => (
            <div key={ci} className="flex flex-col gap-[3px]">
              {col.map((cell, ri) =>
                cell === null ? (
                  <span key={ri} className="size-[11px] rounded-sm bg-transparent" />
                ) : (
                  <span
                    key={ri}
                    title={`${formatDateTime(`${cell.date}T00:00:00Z`, locale)} — ${formatNumber(cell.count, locale)}`}
                    aria-label={`${cell.date}: ${formatNumber(cell.count, locale)}`}
                    role="img"
                    className={cn("size-[11px] rounded-sm", LEVEL_CLASSES[level(cell.count)])}
                  />
                ),
              )}
            </div>
          ))}
        </div>

        <p className="mt-2 text-[10px] text-muted-foreground">{t(dict, "profile.activity.levels")}</p>
      </div>
    </div>
  );
}

"use client";

import dynamic from "next/dynamic";
import { Activity } from "lucide-react";
import type { SalesTrendDatum } from "@/components/charts/sales-trend-chart";
import type { SessionTypesDatum } from "@/components/charts/session-types-chart";
import type { ReportChartDatum } from "@/components/charts/report-bar-chart";

/**
 * Lazy chart boundary for the tenant dashboards and report pages. Recharts is
 * the heaviest dependency in the app; these wrappers keep it in code-split
 * chunks that load only after each page's shell has painted, instead of
 * shipping it on every /app route.
 */

const SalesTrend = dynamic(
  () => import("@/components/charts/sales-trend-chart").then((m) => m.SalesTrendChart),
  {
    ssr: false,
    loading: () => <ChartLoading />,
  },
);

const SessionTypes = dynamic(
  () => import("@/components/charts/session-types-chart").then((m) => m.SessionTypesChart),
  {
    ssr: false,
    loading: () => <ChartLoading />,
  },
);

const ReportChart = dynamic(
  () => import("@/components/charts/report-bar-chart").then((m) => m.ReportBarChart),
  {
    ssr: false,
    loading: () => <ChartLoading />,
  },
);

function ChartLoading() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Activity className="h-4 w-4 animate-pulse text-primary" />
        <span className="text-sm">جاري تحميل الرسم البياني...</span>
      </div>
    </div>
  );
}

export function LazySalesTrendChart({ data }: { data: SalesTrendDatum[] }) {
  return <SalesTrend data={data} />;
}

export function LazySessionTypesChart({
  data,
  labels,
}: {
  data: SessionTypesDatum[];
  labels?: Record<string, string>;
}) {
  return <SessionTypes data={data} labels={labels} />;
}

export function LazyReportChart(props: {
  data: ReportChartDatum[];
  decimals?: number;
  suffix?: string;
  fill?: string;
}) {
  return <ReportChart {...props} />;
}
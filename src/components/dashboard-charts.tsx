"use client";

import dynamic from "next/dynamic";
import { Activity } from "lucide-react";
import type { ChartDatum } from "@/components/dashboard-bar-chart";

/**
 * Lazy chart boundary. Recharts is by far the heaviest dependency in the app
 * and is only needed once the dashboard has data, so it is split into its own
 * chunk and loaded after the dashboard shell has painted.
 */
const DashboardBarChart = dynamic(
  () => import("@/components/dashboard-bar-chart").then((m) => m.DashboardBarChart),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-64 items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Activity className="h-4 w-4 animate-pulse text-primary" />
          <span className="text-sm">جاري تحميل الرسوم البيانية...</span>
        </div>
      </div>
    ),
  },
);

export type { ChartDatum };

export function LazyBarChart({
  data,
  series,
}: {
  data: ChartDatum[];
  series: Array<{ key: string; color: string }>;
}) {
  return <DashboardBarChart data={data} series={series} />;
}

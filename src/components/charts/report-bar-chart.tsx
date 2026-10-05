"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export interface ReportChartDatum {
  name: string;
  value: number;
}

function formatMoney(amount: number, decimals: number, suffix: string): string {
  const riyals = amount / 100;
  return (
    riyals.toLocaleString("ar-SA", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }) + suffix
  );
}

/**
 * Shared report bar chart used by the grocery and SAMA-center report pages.
 * Lives in its own module so recharts is code-split into a lazy chunk.
 */
export function ReportBarChart({
  data,
  decimals = 2,
  suffix = " ر.س",
  fill = "#03EABC",
}: {
  data: ReportChartDatum[];
  decimals?: number;
  suffix?: string;
  fill?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
        <XAxis
          dataKey="name"
          tick={{ fill: "#737373", fontSize: 11 }}
          axisLine={{ stroke: "#404040" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: "#737373", fontSize: 11 }}
          tickFormatter={(v: number) => (v / 100).toLocaleString("ar-SA")}
          axisLine={{ stroke: "#404040" }}
          tickLine={false}
        />
        <Tooltip
          formatter={(value) => formatMoney(Number(value), decimals, suffix)}
          contentStyle={{
            backgroundColor: "#1c1c1c",
            border: "1px solid #333",
            borderRadius: 8,
            color: "#e5e5e5",
          }}
        />
        <Bar dataKey="value" fill={fill} radius={[4, 4, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  );
}
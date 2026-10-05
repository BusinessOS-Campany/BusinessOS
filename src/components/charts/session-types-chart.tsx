"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

export interface SessionTypesDatum {
  type: string;
  count: number;
}

/**
 * Session-types bar chart for the SAMA-center dashboard. Own module again so
 * the page can code-split recharts instead of shipping it on every /app route.
 */
export function SessionTypesChart({
  data,
  labels,
}: {
  data: SessionTypesDatum[];
  labels?: Record<string, string>;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
        <XAxis
          dataKey="type"
          tick={{ fill: "#737373", fontSize: 11 }}
          axisLine={{ stroke: "#404040" }}
          tickLine={false}
          tickFormatter={(v: string) => labels?.[v] ?? v}
        />
        <YAxis
          tick={{ fill: "#737373", fontSize: 11 }}
          axisLine={{ stroke: "#404040" }}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#1c1c1c",
            border: "1px solid #333",
            borderRadius: 8,
            color: "#e5e5e5",
          }}
          formatter={(value) => [String(value), "العدد"]}
          labelFormatter={(label) => String(labels?.[String(label)] ?? label)}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, color: "#a3a3a3" }}
        />
        <Bar
          dataKey="count"
          name="الجلسات"
          fill="#03EABC"
          radius={[4, 4, 0, 0]}
          maxBarSize={50}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
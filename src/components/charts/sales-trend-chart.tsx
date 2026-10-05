"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

export interface SalesTrendDatum {
  day: string;
  sales: number;
}

function formatMoney(amount: number): string {
  const riyals = amount / 100;
  return (
    riyals.toLocaleString("ar-SA", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }) + " ر.س"
  );
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-medium text-card-foreground">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-medium text-foreground">
            {formatMoney(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Sales-trend line chart for the grocery dashboard. Kept in its own module so
 * the page can load recharts lazily via next/dynamic instead of shipping it
 * in every /app route bundle.
 */
export function SalesTrendChart({ data }: { data: SalesTrendDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
        <XAxis
          dataKey="day"
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
        <Tooltip content={<CustomTooltip />} cursor={{ stroke: "rgba(3,234,188,0.2)" }} />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, color: "#a3a3a3" }}
        />
        <Line
          type="monotone"
          dataKey="sales"
          name="المبيعات"
          stroke="#03EABC"
          strokeWidth={2}
          dot={{ fill: "#03EABC", r: 3 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
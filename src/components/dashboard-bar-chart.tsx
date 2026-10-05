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

export interface ChartDatum {
  name: string;
  [series: string]: string | number;
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

function axisProps() {
  return {
    tick: { fill: "#737373", fontSize: 11 },
    tickFormatter: (v: number) => (v / 100).toLocaleString("ar-SA"),
    axisLine: { stroke: "#404040" },
    tickLine: false,
  } as const;
}

function legendProps() {
  return {
    iconType: "square" as const,
    iconSize: 10,
    wrapperStyle: { fontSize: 12, color: "#a3a3a3" },
  };
}

/**
 * Chart island for the tenant dashboard.
 *
 * Recharts is by far the heaviest dependency in the app and is only needed once
 * the dashboard has data. Keeping it in its own client component lets the
 * dashboard route load it lazily instead of shipping it in the initial bundle.
 */
export function DashboardBarChart({
  data,
  series,
}: {
  data: ChartDatum[];
  series: Array<{ key: string; color: string }>;
}) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" barGap={4}>
          <CartesianGrid strokeDasharray="3 3" stroke="#262626" horizontal={false} />
          <XAxis type="number" {...axisProps()} />
          <YAxis
            dataKey="name"
            type="category"
            tick={{ fill: "#a3a3a3", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={80}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
          <Legend {...legendProps()} />
          {series.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              fill={s.color}
              radius={[0, 4, 4, 0]}
              maxBarSize={40}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

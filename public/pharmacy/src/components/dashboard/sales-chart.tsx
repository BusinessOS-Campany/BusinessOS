"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Locale } from "@/lib/i18n";

export function SalesChart({
  data,
  locale,
}: {
  data: Array<{ date: string; total: number }>;
  locale: Locale;
}) {
  return (
    <div className="h-64 w-full" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="oklch(0.58 0.12 155)" stopOpacity={0.4} />
              <stop offset="95%" stopColor="oklch(0.58 0.12 155)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
          <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" width={50} />
          <Tooltip
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(value) => [
              `${Number(value).toLocaleString("en-US")} ${locale === "ar" ? "ر.ي" : "YER"}`,
              locale === "ar" ? "المبيعات" : "Sales",
            ]}
          />
          <Area
            type="monotone"
            dataKey="total"
            stroke="oklch(0.58 0.12 155)"
            strokeWidth={2}
            fill="url(#salesGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
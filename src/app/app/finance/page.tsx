"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Receipt,
} from "lucide-react";

interface FinanceData {
  periodDays: number;
  sales: { invoices: number; total: number; paidTotal: number };
  profit: { revenue: number; cogs: number; grossProfit: number };
  inventory: { totalValue: number; lowStock: number };
  debt: { totalReceivable: number; customers: number };
  cashflow: { inflow: number; outflow: number; net: number };
}

function formatMoney(amount: number) {
  return (amount / 100).toLocaleString("ar-SA") + " ر.س";
}

export default function FinancePage() {
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/v1/reports/summary?days=30");
        const json = await res.json();
        if (!json.ok) {
          setError("لا توجد صلاحية لعرض البيانات المالية");
          return;
        }
        setData(json.data);
      } catch {
        setError("فشل تحميل البيانات المالية");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const kpis = data
    ? [
        {
          icon: <Receipt className="h-6 w-6 text-primary" />,
          label: "المبيعات / Sales",
          value: formatMoney(data.sales.total),
          sub: `${data.sales.invoices} فاتورة / invoices`,
        },
        {
          icon: <TrendingUp className="h-6 w-6 text-primary" />,
          label: "صافي الربح / Gross Profit",
          value: formatMoney(data.profit.grossProfit),
          sub: `الإيرادات: ${formatMoney(data.profit.revenue)}`,
        },
        {
          icon: <DollarSign className="h-6 w-6 text-primary" />,
          label: "التدفق الداخل / Cash Inflow",
          value: formatMoney(data.cashflow.inflow),
          sub: "إجمالي الوارد",
        },
        {
          icon: <TrendingDown className="h-6 w-6 text-red-400" />,
          label: "التدفق الخارج / Cash Outflow",
          value: formatMoney(data.cashflow.outflow),
          sub: "إجمالي الصادر",
        },
      ]
    : [];

  return (
    <div dir="rtl" className="min-h-screen bg-background p-6">
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-foreground">
            المالية / Finance
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-32 animate-pulse rounded-xl border border-border bg-background p-6"
                >
                  <div className="mb-3 h-4 w-24 rounded bg-secondary" />
                  <div className="mb-2 h-7 w-32 rounded bg-secondary" />
                  <div className="h-3 w-20 rounded bg-secondary" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="py-12 text-center text-red-400">{error}</div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {kpis.map((kpi) => (
                <Card
                  key={kpi.label}
                  className="border-border bg-background"
                >
                  <CardContent className="p-6">
                    <div className="mb-3 flex items-center gap-2">
                      {kpi.icon}
                      <span className="text-sm text-muted-foreground">
                        {kpi.label}
                      </span>
                    </div>
                    <p className="text-2xl font-bold text-foreground">
                      {kpi.value}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{kpi.sub}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

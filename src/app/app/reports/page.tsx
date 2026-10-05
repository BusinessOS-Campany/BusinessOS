"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ReportData {
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

const PERIODS = [
  { label: "7 أيام", days: 7 },
  { label: "30 يوم", days: 30 },
  { label: "90 يوم", days: 90 },
  { label: "365 يوم", days: 365 },
] as const;

export default function ReportsPage() {
  const [period, setPeriod] = useState(30);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/v1/reports/summary?days=${period}`);
        const json = await res.json();
        if (cancelled) return;
        if (!json.ok) {
          setError("فشل تحميل التقارير");
          return;
        }
        setData(json.data);
      } catch {
        if (cancelled) return;
        setError("فشل تحميل التقارير");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [period]);

  return (
    <div dir="rtl" className="min-h-screen bg-background p-6">
      <Card className="border-border bg-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-xl font-bold text-foreground">
            التقارير / Reports
          </CardTitle>
          <div className="flex gap-2">
            {PERIODS.map((p) => (
              <Button
                key={p.days}
                variant={period === p.days ? "default" : "outline"}
                size="sm"
                onClick={() => setPeriod(p.days)}
                className={cn(
                  period !== p.days &&
                    "border-border text-card-foreground"
                )}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-40 animate-pulse rounded-xl border border-border bg-background p-6"
                >
                  <div className="mb-3 h-4 w-28 rounded bg-secondary" />
                  <div className="space-y-2">
                    <div className="h-3 w-full rounded bg-secondary" />
                    <div className="h-3 w-3/4 rounded bg-secondary" />
                    <div className="h-3 w-1/2 rounded bg-secondary" />
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="py-12 text-center text-red-400">{error}</div>
          ) : data ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Card className="border-border bg-background">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">
                    ملخص المبيعات / Sales Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">عدد الفواتير</span>
                    <span className="text-foreground">
                      {data.sales.invoices}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">إجمالي الإيرادات</span>
                    <span className="text-foreground">
                      {formatMoney(data.sales.total)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">متوسط الطلب</span>
                    <span className="text-foreground">
                      {data.sales.invoices > 0
                        ? formatMoney(
                            Math.round(data.sales.total / data.sales.invoices)
                          )
                        : "—"}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border bg-background">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">
                    الربح / Profit
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">الإيرادات</span>
                    <span className="text-foreground">
                      {formatMoney(data.profit.revenue)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">تكلفة البضاعة</span>
                    <span className="text-foreground">
                      {formatMoney(data.profit.cogs)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">صافي الربح</span>
                    <span className="text-primary">
                      {formatMoney(data.profit.grossProfit)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">نسبة الربح</span>
                    <span className="text-foreground">
                      {data.profit.revenue > 0
                        ? (
                            (data.profit.grossProfit / data.profit.revenue) *
                            100
                          ).toFixed(1) + "%"
                        : "—"}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border bg-background">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">
                    المخزون / Inventory
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">القيمة الإجمالية</span>
                    <span className="text-foreground">
                      {formatMoney(data.inventory.totalValue)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">أصناف قليلة المخزون</span>
                    <span className="text-amber-400">
                      {data.inventory.lowStock}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border bg-background">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">
                    الديون / Debt
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">إجمالي المستحق</span>
                    <span className="text-foreground">
                      {formatMoney(data.debt.totalReceivable)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">عدد العملاء</span>
                    <span className="text-foreground">
                      {data.debt.customers}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

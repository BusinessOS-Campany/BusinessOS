"use client";

import { useState, useCallback } from "react";
import {
  ChartLine,
  Download,
  Activity,
  AlertTriangle,
  BarChart3,
  ShoppingCart,
  ReceiptText,
  DollarSign,
  Users,
  Truck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LazyReportChart } from "@/components/charts/lazy-charts";

type ReportType = "sales" | "purchases" | "profit" | "tax" | "customers" | "suppliers" | "expenses";

const REPORT_TYPES: Array<{
  value: ReportType;
  label: string;
  labelAr: string;
  icon: LucideIcon;
}> = [
  { value: "sales", label: "Sales", labelAr: "المبيعات", icon: ReceiptText },
  { value: "purchases", label: "Purchases", labelAr: "المشتريات", icon: ShoppingCart },
  { value: "profit", label: "Profit", labelAr: "الربح", icon: DollarSign },
  { value: "tax", label: "Tax", labelAr: "الضرائب", icon: BarChart3 },
  { value: "customers", label: "Customers", labelAr: "العملاء", icon: Users },
  { value: "suppliers", label: "Suppliers", labelAr: "الموردين", icon: Truck },
  { value: "expenses", label: "Expenses", labelAr: "المصروفات", icon: Wallet },
];

interface ReportRow {
  label: string;
  value: number;
  count?: number;
}

interface ReportData {
  type: ReportType;
  title: string;
  total: number;
  rows: ReportRow[];
  chartData: Array<{ name: string; value: number }>;
}

function formatMoney(amount: number): string {
  const riyals = amount / 100;
  return (
    riyals.toLocaleString("ar-SA", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " ر.س"
  );
}

export default function GroceryReportsPage() {
  const [reportType, setReportType] = useState<ReportType>("sales");
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(() =>
    new Date().toISOString().split("T")[0]
  );
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        type: reportType,
        dateFrom,
        dateTo,
      });
      const res = await fetch(`/api/v1/grocery/reports?${params.toString()}`);
      const json = await res.json();
      if (json.ok) {
        setData(json.data);
      } else {
        setError("فشل تحميل التقرير");
      }
    } catch {
      setError("فشل تحميل التقرير");
    } finally {
      setLoading(false);
    }
  }, [reportType, dateFrom, dateTo]);

  function exportCSV() {
    if (!data?.rows.length) return;
    const headers = ["البيان", "المبلغ", "العدد"];
    const csvRows = data.rows.map((r) => [
      r.label,
      String(r.value / 100),
      r.count !== undefined ? String(r.count) : "",
    ]);
    const csv = [headers, ...csvRows].map((r) => r.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `grocery-report-${reportType}-${dateFrom}-${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div dir="rtl" className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">التقارير</h1>
          <p className="text-sm text-muted-foreground">
            تقارير المبيعات والمشتريات والأرباح
          </p>
        </div>
      </div>

      {/* Report Type Selector */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {REPORT_TYPES.map((rt) => {
          const Icon = rt.icon;
          return (
            <button
              key={rt.value}
              onClick={() => setReportType(rt.value)}
              className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-colors ${
                reportType === rt.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:bg-accent text-muted-foreground"
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="text-xs font-medium">{rt.labelAr}</span>
            </button>
          );
        })}
      </div>

      {/* Date Range + Actions */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full sm:w-40"
            />
            <span className="text-sm text-muted-foreground hidden sm:inline">
              إلى
            </span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full sm:w-40"
            />
            <Button
              className="bg-primary hover:bg-primary/80 text-white"
              onClick={fetchReport}
              disabled={loading}
            >
              {loading ? (
                <Activity className="ml-2 h-4 w-4 animate-spin" />
              ) : (
                <ChartLine className="ml-2 h-4 w-4" />
              )}
              عرض التقرير
            </Button>
            {data && data.rows.length > 0 && (
              <Button variant="outline" onClick={exportCSV}>
                <Download className="ml-2 h-4 w-4" />
                تصدير CSV
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-red-400">
              <AlertTriangle className="h-5 w-5" />
              <span className="text-sm">{error}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Report Results */}
      {data && !loading && (
        <>
          {/* Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-card-foreground">
                {REPORT_TYPES.find((r) => r.value === data.type)?.labelAr} —{" "}
                {dateFrom} إلى {dateTo}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-primary">
                {formatMoney(data.total)}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                إجمالي التقرير
              </p>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Chart */}
            {data.chartData.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm text-card-foreground">
                    الرسم البياني
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <LazyReportChart
                      data={data.chartData}
                      decimals={2}
                      suffix=" ر.س"
                      fill="#03EABC"
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Data Table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-card-foreground">
                  التفاصيل
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>البيان</TableHead>
                      <TableHead>المبلغ</TableHead>
                      {data.rows.some((r) => r.count !== undefined) && (
                        <TableHead>العدد</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.rows.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">
                          {row.label}
                        </TableCell>
                        <TableCell>{formatMoney(row.value)}</TableCell>
                        {data.rows.some((r) => r.count !== undefined) && (
                          <TableCell>{row.count ?? "—"}</TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Empty state */}
      {!data && !loading && !error && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex h-48 items-center justify-center">
              <div className="text-center">
                <ChartLine className="mx-auto h-10 w-10 text-muted-foreground opacity-30" />
                <p className="mt-3 text-sm text-muted-foreground">
                  اختر نوع التقرير والنطاق الزمني ثم اضغط &quot;عرض التقرير&quot;
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

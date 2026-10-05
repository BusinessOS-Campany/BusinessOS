"use client";

import { useState, useCallback } from "react";
import {
  ChartLine,
  Download,
  Printer,
  Activity,
  AlertTriangle,
  CalendarDays,
  Users,
  DollarSign,
  Stethoscope,
  ClipboardList,
  HeartPulse,
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

type ReportType = "daily" | "weekly" | "monthly";

const REPORT_TYPES: Array<{
  value: ReportType;
  label: string;
  labelAr: string;
  icon: LucideIcon;
}> = [
  { value: "daily", label: "Daily", labelAr: "يومي", icon: CalendarDays },
  { value: "weekly", label: "Weekly", labelAr: "أسبوعي", icon: ClipboardList },
  { value: "monthly", label: "Monthly", labelAr: "شهري", icon: ChartLine },
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
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }) + " ي.ع"
  );
}

export default function SamaCenterReportsPage() {
  const [reportType, setReportType] = useState<ReportType>("monthly");
  const [date, setDate] = useState(() =>
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
        date,
      });
      const res = await fetch(`/api/v1/sama-center/reports?${params.toString()}`);
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
  }, [reportType, date]);

  function exportCSV() {
    if (!data?.rows.length) return;
    const headers = ["البيان", "المبلغ", "العدد"];
    const csvRows = data.rows.map((r) => [
      r.label,
      String(r.value / 100),
      r.count !== undefined ? String(r.count) : "",
    ]);
    const csv = [headers, ...csvRows].map((r) => r.join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sama-center-report-${reportType}-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function printReport() {
    window.print();
  }

  return (
    <div dir="rtl" className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">التقارير</h1>
          <p className="text-sm text-muted-foreground">
            تقارير العيادة المختلفة
          </p>
        </div>
        {data && data.rows.length > 0 && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportCSV}>
              <Download className="ml-2 h-4 w-4" />
              تصدير
            </Button>
            <Button variant="outline" onClick={printReport}>
              <Printer className="ml-2 h-4 w-4" />
              طباعة
            </Button>
          </div>
        )}
      </div>

      {/* Report Type Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {REPORT_TYPES.map((rt) => {
          const Icon = rt.icon;
          return (
            <button
              key={rt.value}
              onClick={() => setReportType(rt.value)}
              className={`flex items-center gap-3 rounded-lg border p-4 transition-colors ${
                reportType === rt.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:bg-accent text-muted-foreground"
              }`}
            >
              <Icon className="h-6 w-6" />
              <div className="text-right">
                <p className="text-sm font-medium">{rt.labelAr}</p>
                <p className="text-xs text-muted-foreground">{rt.label}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Date Picker + Actions */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full sm:w-48"
              dir="ltr"
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
                {date}
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
                      decimals={0}
                      suffix=" ي.ع"
                      fill="#0d9488"
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
                  اختر نوع التقرير والتاريخ ثم اضغط &quot;عرض التقرير&quot;
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

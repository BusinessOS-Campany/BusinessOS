"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Search,
  Eye,
  ReceiptText,
  Activity,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Filter,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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

interface Sale {
  id: string;
  invoiceNo: string;
  date: string;
  customerName: string;
  itemCount: number;
  total: number;
  paidAmount: number;
  status: "paid" | "partial" | "unpaid" | "cancelled";
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

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("ar-SA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const STATUS_MAP: Record<
  string,
  { label: string; variant: "success" | "secondary" | "destructive" | "warning" }
> = {
  paid: { label: "مدفوع", variant: "success" },
  partial: { label: "جزئي", variant: "warning" },
  unpaid: { label: "غير مدفوع", variant: "destructive" },
  cancelled: { label: "ملغي", variant: "secondary" },
};

export default function GrocerySalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [total, setTotal] = useState(0);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pageSize = 20;

  const fetchSales = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (status && status !== "all") params.set("status", status);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));

      const res = await fetch(`/api/v1/grocery/sales?${params.toString()}`);
      const json = await res.json();
      if (json.ok) {
        setSales(json.data.items);
        setTotal(json.data.total);
      } else {
        setError("فشل تحميل المبيعات");
      }
    } catch {
      setError("فشل تحميل المبيعات");
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, status, page]);

  useEffect(() => {
    fetchSales();
  }, [fetchSales]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div dir="rtl" className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">المبيعات</h1>
          <p className="text-sm text-muted-foreground">
            سجل فواتير المبيعات
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ReceiptText className="h-4 w-4" />
          <span>{total} فاتورة</span>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Filter className="h-4 w-4" />
              <span>فلتر:</span>
            </div>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              className="w-full sm:w-40"
              placeholder="من تاريخ"
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              className="w-full sm:w-40"
              placeholder="إلى تاريخ"
            />
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="كل الحالات" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                <SelectItem value="paid">مدفوع</SelectItem>
                <SelectItem value="partial">جزئي</SelectItem>
                <SelectItem value="unpaid">غير مدفوع</SelectItem>
                <SelectItem value="cancelled">ملغي</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Sales Table */}
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex h-48 items-center justify-center">
              <div className="flex items-center gap-3 text-muted-foreground">
                <Activity className="h-5 w-5 animate-pulse text-primary" />
                <span className="text-sm">جاري التحميل...</span>
              </div>
            </div>
          ) : error ? (
            <div className="flex h-48 items-center justify-center">
              <div className="flex items-center gap-3 text-red-400">
                <AlertTriangle className="h-5 w-5" />
                <span className="text-sm">{error}</span>
              </div>
            </div>
          ) : sales.length === 0 ? (
            <div className="flex h-48 items-center justify-center">
              <div className="text-center">
                <ReceiptText className="mx-auto h-10 w-10 text-muted-foreground" />
                <p className="mt-3 text-sm text-muted-foreground">
                  لا توجد فواتير مبيعات
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>رقم الفاتورة</TableHead>
                    <TableHead>التاريخ</TableHead>
                    <TableHead>العميل</TableHead>
                    <TableHead>الأصناف</TableHead>
                    <TableHead>الإجمالي</TableHead>
                    <TableHead>المدفوع</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead className="text-left">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sales.map((s) => {
                    const st = STATUS_MAP[s.status] ?? STATUS_MAP.unpaid;
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="font-mono text-xs">
                          {s.invoiceNo}
                        </TableCell>
                        <TableCell>{formatDate(s.date)}</TableCell>
                        <TableCell className="font-medium">
                          {s.customerName || "عميل نقدي"}
                        </TableCell>
                        <TableCell>{s.itemCount}</TableCell>
                        <TableCell className="font-medium">
                          {formatMoney(s.total)}
                        </TableCell>
                        <TableCell>{formatMoney(s.paidAmount)}</TableCell>
                        <TableCell>
                          <Badge variant={st.variant}>{st.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <Link href={`/app/grocery/sales?id=${s.id}`}>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border px-2 py-3 mt-4">
              <span className="text-xs text-muted-foreground">
                {total} فاتورة — صفحة {page} من {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

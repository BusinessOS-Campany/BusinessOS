"use client";

import { useState } from "react";
import {
  Search,
  Boxes,
  Activity,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  History,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useApiData } from "@/hooks/use-api-data";

interface StockItem {
  id: string;
  productName: string;
  categoryName: string;
  currentStock: number;
  minStock: number;
  maxStock: number;
  unitCost: number;
  stockValue: number;
  status: "ok" | "low" | "out";
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

function statusBadge(status: StockItem["status"]) {
  switch (status) {
    case "out":
      return <Badge variant="destructive">نفد</Badge>;
    case "low":
      return <Badge variant="warning">منخفض</Badge>;
    case "ok":
    default:
      return <Badge variant="success">متوفر</Badge>;
  }
}

export default function GroceryInventoryPage() {
  const [search, setSearch] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const inventoryUrl = (() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (lowStockOnly) params.set("lowStock", "true");
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    return `/api/v1/grocery/inventory?${params.toString()}`;
  })();
  const { data: inventoryData, loading, error, refetch } = useApiData<{
    items: StockItem[];
    total: number;
  }>(inventoryUrl);
  const items = inventoryData?.items ?? [];
  const total = inventoryData?.total ?? 0;

  const totalPages = Math.ceil(total / pageSize);

  const totalValue = items.reduce((sum, i) => sum + i.stockValue, 0);

  return (
    <div dir="rtl" className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">المخزون</h1>
          <p className="text-sm text-muted-foreground">
            إدارة مستويات المخزون والト_movements
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <History className="ml-2 h-4 w-4" />
            سجل الحركات
          </Button>
          <Button className="bg-primary hover:bg-primary/80 text-white" size="sm">
            <ArrowUpDown className="ml-2 h-4 w-4" />
            تعديل مخزون
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">إجمالي المخزون</p>
            <p className="text-2xl font-bold text-foreground mt-1">
              {total} صنف
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">قيمة المخزون</p>
            <p className="text-2xl font-bold text-primary mt-1">
              {formatMoney(totalValue)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">مخزون منخفض</p>
            <p className="text-2xl font-bold text-amber-400 mt-1">
              {items.filter((i) => i.status !== "ok").length} صنف
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="بحث بالمنتج..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pr-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="lowStock"
                checked={lowStockOnly}
                onCheckedChange={(v) => {
                  setLowStockOnly(v);
                  setPage(1);
                }}
              />
              <Label htmlFor="lowStock" className="text-sm cursor-pointer">
                منخفض فقط
              </Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stock Table */}
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
            <div className="flex h-48 flex-col items-center justify-center gap-3">
              <div className="flex items-center gap-3 text-red-400">
                <AlertTriangle className="h-5 w-5" />
                <span className="text-sm">{error}</span>
              </div>
              <Button variant="outline" size="sm" onClick={() => void refetch()}>
                إعادة المحاولة
              </Button>
            </div>
          ) : items.length === 0 ? (
            <div className="flex h-48 items-center justify-center">
              <div className="text-center">
                <Boxes className="mx-auto h-10 w-10 text-muted-foreground" />
                <p className="mt-3 text-sm text-muted-foreground">
                  لا توجد بيانات مخزون
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>المنتج</TableHead>
                    <TableHead>القسم</TableHead>
                    <TableHead>المخزون الحالي</TableHead>
                    <TableHead>الحد الأدنى</TableHead>
                    <TableHead>الحد الأقصى</TableHead>
                    <TableHead>التكلفة</TableHead>
                    <TableHead>القيمة</TableHead>
                    <TableHead>الحالة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        {item.productName}
                      </TableCell>
                      <TableCell>{item.categoryName}</TableCell>
                      <TableCell>
                        <span
                          className={
                            item.currentStock === 0
                              ? "text-red-400 font-bold"
                              : item.currentStock <= item.minStock
                                ? "text-amber-400 font-medium"
                                : "text-foreground"
                          }
                        >
                          {item.currentStock}
                        </span>
                      </TableCell>
                      <TableCell>{item.minStock}</TableCell>
                      <TableCell>{item.maxStock}</TableCell>
                      <TableCell>{formatMoney(item.unitCost)}</TableCell>
                      <TableCell className="font-medium">
                        {formatMoney(item.stockValue)}
                      </TableCell>
                      <TableCell>{statusBadge(item.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border px-2 py-3 mt-4">
              <span className="text-xs text-muted-foreground">
                {total} صنف — صفحة {page} من {totalPages}
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

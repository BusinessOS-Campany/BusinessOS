"use client";

import { useState } from "react";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Package,
  Activity,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
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
import { useApiData } from "@/hooks/use-api-data";

interface Product {
  id: string;
  sku: string;
  name: string;
  categoryName: string;
  brandName: string;
  costPrice: number;
  salePrice: number;
  currentStock: number;
  isActive: boolean;
}

interface Filters {
  search: string;
  category: string;
  brand: string;
  page: number;
  pageSize: number;
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

export default function GroceryProductsPage() {
  const [filters, setFilters] = useState<Filters>({
    search: "",
    category: "",
    brand: "",
    page: 1,
    pageSize: 20,
  });

  const productsUrl = (() => {
    const params = new URLSearchParams();
    if (filters.search) params.set("search", filters.search);
    if (filters.category) params.set("categoryId", filters.category);
    if (filters.brand) params.set("brandId", filters.brand);
    params.set("page", String(filters.page));
    params.set("pageSize", String(filters.pageSize));
    return `/api/v1/grocery/products?${params.toString()}`;
  })();
  const { data: productsData, loading, error, refetch } =
    useApiData<{ items: Product[]; total: number }>(productsUrl);
  const products = productsData?.items ?? [];
  const total = productsData?.total ?? 0;
  const categories = useApiData<Array<{ id: string; name: string }>>(
    "/api/v1/grocery/categories",
  );
  const brands = useApiData<Array<{ id: string; name: string }>>(
    "/api/v1/grocery/brands",
  );
  const categoryOptions = categories.data ?? [];
  const brandOptions = brands.data ?? [];

  const totalPages = Math.ceil(total / filters.pageSize);

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  }

  return (
    <div dir="rtl" className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">المنتجات</h1>
          <p className="text-sm text-muted-foreground">
            إدارة المنتجات والأسعار والمخزون
          </p>
        </div>
        <Button className="bg-primary hover:bg-primary/80 text-white">
          <Plus className="ml-2 h-4 w-4" />
          إضافة منتج
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="بحث بالاسم أو الكود..."
                value={filters.search}
                onChange={(e) => updateFilter("search", e.target.value)}
                className="pr-9"
              />
            </div>
            <Select
              value={filters.category}
              onValueChange={(v) => updateFilter("category", v)}
            >
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="كل الأقسام" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الأقسام</SelectItem>
                {categoryOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filters.brand}
              onValueChange={(v) => updateFilter("brand", v)}
            >
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="كل العلامات" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل العلامات</SelectItem>
                {brandOptions.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Products Table */}
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
          ) : products.length === 0 ? (
            <div className="flex h-48 items-center justify-center">
              <div className="text-center">
                <Package className="mx-auto h-10 w-10 text-muted-foreground" />
                <p className="mt-3 text-sm text-muted-foreground">
                  لا توجد منتجات
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الكود</TableHead>
                    <TableHead>الاسم</TableHead>
                    <TableHead>القسم</TableHead>
                    <TableHead>العلامة</TableHead>
                    <TableHead>سعر التكلفة</TableHead>
                    <TableHead>سعر البيع</TableHead>
                    <TableHead>المخزون</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead className="text-left">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">
                        {p.sku}
                      </TableCell>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell>{p.categoryName}</TableCell>
                      <TableCell>{p.brandName}</TableCell>
                      <TableCell>{formatMoney(p.costPrice)}</TableCell>
                      <TableCell>{formatMoney(p.salePrice)}</TableCell>
                      <TableCell>
                        <span
                          className={
                            p.currentStock <= 0
                              ? "text-red-400 font-medium"
                              : p.currentStock <= 10
                                ? "text-amber-400 font-medium"
                                : "text-foreground"
                          }
                        >
                          {p.currentStock}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={p.isActive ? "success" : "secondary"}
                        >
                          {p.isActive ? "نشط" : "غير نشط"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-400 hover:text-red-300"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
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
                {total} منتج — صفحة {filters.page} من {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={filters.page <= 1}
                  onClick={() =>
                    setFilters((prev) => ({ ...prev, page: prev.page - 1 }))
                  }
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={filters.page >= totalPages}
                  onClick={() =>
                    setFilters((prev) => ({ ...prev, page: prev.page + 1 }))
                  }
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

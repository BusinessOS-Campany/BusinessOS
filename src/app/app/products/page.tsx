"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Package, Plus, Search, Loader2 } from "lucide-react";

interface Product {
  id: string;
  sku: string;
  barcode: string | null;
  nameAr: string;
  nameEn: string | null;
  salePrice: number;
  costPrice: number;
  wholesalePrice: number | null;
  taxRateBps: number | null;
  trackStock: boolean;
  minStock: number | null;
}

interface ProductListResponse {
  products: Product[];
}

const EMPTY_FORM = {
  sku: "",
  nameAr: "",
  nameEn: "",
  barcode: "",
  costPrice: "",
  salePrice: "",
  wholesalePrice: "",
  trackStock: true,
  minStock: "",
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const fetchProducts = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (q) params.set("q", q);
      const data = await apiGet<ProductListResponse>(`/api/v1/products?${params}`);
      setProducts(data.products);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({ limit: "50" });
        const data = await apiGet<ProductListResponse>(`/api/v1/products?${params}`);
        if (!cancelled) setProducts(data.products);
      } catch {
        if (!cancelled) setProducts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void fetchProducts(search);
    }, 350);
    return () => clearTimeout(timeout);
  }, [search, fetchProducts]);

  function updateField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiPost("/api/v1/products", {
        sku: form.sku.trim(),
        nameAr: form.nameAr.trim(),
        nameEn: form.nameEn.trim() || undefined,
        barcode: form.barcode.trim() || undefined,
        costPrice: Math.round(Number(form.costPrice) * 100),
        salePrice: Math.round(Number(form.salePrice) * 100),
        wholesalePrice: form.wholesalePrice ? Math.round(Number(form.wholesalePrice) * 100) : undefined,
        trackStock: form.trackStock,
        minStock: form.minStock ? Number(form.minStock) : undefined,
      });
      setDialogOpen(false);
      setForm(EMPTY_FORM);
      void fetchProducts(search);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "حدث خطأ غير متوقع";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  function formatSAR(amount: number) {
    return `${(amount / 100).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
  }

  return (
    <div dir="rtl" className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Package className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">المنتجات / Products</h1>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                إضافة منتج
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
              <DialogHeader>
                <DialogTitle>إضافة منتج جديد</DialogTitle>
                <DialogDescription>أدخل بيانات المنتج الجديد في النموذج أدناه.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                {error && (
                  <div className="rounded-md bg-red-900/30 px-3 py-2 text-sm text-red-300">{error}</div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="sku">رمز المنتج (SKU) *</Label>
                  <Input
                    id="sku"
                    required
                    placeholder="例: PRD-001"
                    value={form.sku}
                    onChange={(e) => updateField("sku", e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nameAr">الاسم بالعربي *</Label>
                  <Input
                    id="nameAr"
                    required
                    dir="rtl"
                    placeholder="اسم المنتج"
                    value={form.nameAr}
                    onChange={(e) => updateField("nameAr", e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nameEn">الاسم بالانجليزي</Label>
                  <Input
                    id="nameEn"
                    placeholder="Product name"
                    value={form.nameEn}
                    onChange={(e) => updateField("nameEn", e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="barcode">الباركود</Label>
                  <Input
                    id="barcode"
                    placeholder="123456789"
                    value={form.barcode}
                    onChange={(e) => updateField("barcode", e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="costPrice">سعر التكلفة (ر.س) *</Label>
                    <Input
                      id="costPrice"
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={form.costPrice}
                      onChange={(e) => updateField("costPrice", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="salePrice">سعر البيع (ر.س) *</Label>
                    <Input
                      id="salePrice"
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={form.salePrice}
                      onChange={(e) => updateField("salePrice", e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="wholesalePrice">سعر الجملة (ر.س)</Label>
                  <Input
                    id="wholesalePrice"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={form.wholesalePrice}
                    onChange={(e) => updateField("wholesalePrice", e.target.value)}
                  />
                </div>

                <div className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2">
                  <Label htmlFor="trackStock" className="cursor-pointer">
                    تتبع المخزون
                  </Label>
                  <Switch
                    id="trackStock"
                    checked={form.trackStock}
                    onCheckedChange={(checked) => updateField("trackStock", checked)}
                  />
                </div>

                {form.trackStock && (
                  <div className="space-y-2">
                    <Label htmlFor="minStock">الحد الأدنى للمخزون</Label>
                    <Input
                      id="minStock"
                      type="number"
                      min="0"
                      placeholder="0"
                      value={form.minStock}
                      onChange={(e) => updateField("minStock", e.target.value)}
                    />
                  </div>
                )}

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDialogOpen(false)}
                    disabled={submitting}
                  >
                    إلغاء
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        جاري الحفظ...
                      </>
                    ) : (
                      "حفظ المنتج"
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="relative">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            dir="rtl"
            placeholder="بحث بالاسم، رمز المنتج، أو الباركود..."
            className="pr-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg text-foreground">قائمة المنتجات</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-right">رمز المنتج</TableHead>
                  <TableHead className="text-right">الاسم بالعربي</TableHead>
                  <TableHead className="text-right">سعر البيع</TableHead>
                  <TableHead className="text-right">سعر التكلفة</TableHead>
                  <TableHead className="text-right">تتبع المخزون</TableHead>
                  <TableHead className="text-right">الباركود</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={`skel-${i}`} className="border-border">
                        {Array.from({ length: 6 }).map((_, j) => (
                          <TableCell key={`skel-${i}-${j}`}>
                            <div className="h-4 animate-pulse rounded bg-secondary" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  : products.length === 0
                    ? (
                        <TableRow className="border-border">
                          <TableCell colSpan={6} className="h-32 text-center">
                            <div className="flex flex-col items-center gap-2 text-muted-foreground">
                              <Package className="h-8 w-8" />
                              <p>لا توجد منتجات</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    : products.map((product) => (
                        <TableRow key={product.id} className="border-border">
                          <TableCell>
                            <Badge variant="secondary" className="font-mono">
                              {product.sku}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium text-foreground">
                            {product.nameAr}
                            {product.nameEn && (
                              <span className="mr-2 text-xs text-muted-foreground">({product.nameEn})</span>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatSAR(product.salePrice)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatSAR(product.costPrice)}
                          </TableCell>
                          <TableCell>
                            {product.trackStock ? (
                              <Badge variant="success">نعم</Badge>
                            ) : (
                              <Badge variant="outline">لا</Badge>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-muted-foreground">
                            {product.barcode ?? "—"}
                          </TableCell>
                        </TableRow>
                      ))
                }
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

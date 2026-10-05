"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Truck,
  Activity,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface Supplier {
  id: string;
  code: string;
  name: string;
  phone: string;
  email: string;
  balance: number;
  creditLimit: number;
  isActive: boolean;
}

interface Filters {
  search: string;
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

const emptyForm = { name: "", phone: "", email: "", creditLimit: "" };

export default function GrocerySuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({
    search: "",
    page: 1,
    pageSize: 20,
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.search) params.set("search", filters.search);
      params.set("page", String(filters.page));
      params.set("pageSize", String(filters.pageSize));

      const res = await fetch(
        `/api/v1/grocery/suppliers?${params.toString()}`
      );
      const json = await res.json();
      if (json.ok) {
        setSuppliers(json.data.items);
        setTotal(json.data.total);
      } else {
        setError("فشل تحميل الموردين");
      }
    } catch {
      setError("فشل تحميل الموردين");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  const totalPages = Math.ceil(total / filters.pageSize);

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  }

  function openCreateDialog() {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEditDialog(supplier: Supplier) {
    setEditingId(supplier.id);
    setForm({
      name: supplier.name,
      phone: supplier.phone,
      email: supplier.email,
      creditLimit: String(supplier.creditLimit / 100),
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const url = editingId
        ? `/api/v1/grocery/suppliers/${editingId}`
        : "/api/v1/grocery/suppliers";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          email: form.email,
          creditLimit: Math.round(Number(form.creditLimit) * 100),
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setDialogOpen(false);
        fetchSuppliers();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("هل أنت متأكد من الحذف؟")) return;
    const res = await fetch(`/api/v1/grocery/suppliers/${id}`, {
      method: "DELETE",
    });
    const json = await res.json();
    if (json.ok) fetchSuppliers();
  }

  return (
    <div dir="rtl" className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">الموردون</h1>
          <p className="text-sm text-muted-foreground">
            إدارة بيانات الموردين والحسابات
          </p>
        </div>
        <Button
          className="bg-primary hover:bg-primary/80 text-white"
          onClick={openCreateDialog}
        >
          <Plus className="ml-2 h-4 w-4" />
          إضافة مورد
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="بحث بالاسم أو الكود أو الهاتف..."
                value={filters.search}
                onChange={(e) => updateFilter("search", e.target.value)}
                className="pr-9"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
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
          ) : suppliers.length === 0 ? (
            <div className="flex h-48 items-center justify-center">
              <div className="text-center">
                <Truck className="mx-auto h-10 w-10 text-muted-foreground" />
                <p className="mt-3 text-sm text-muted-foreground">
                  لا يوجد موردون
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
                    <TableHead>الهاتف</TableHead>
                    <TableHead>البريد الإلكتروني</TableHead>
                    <TableHead>الرصيد</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead className="text-left">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suppliers.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs">
                        {s.code}
                      </TableCell>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell dir="ltr" className="text-right">
                        {s.phone}
                      </TableCell>
                      <TableCell>{s.email}</TableCell>
                      <TableCell>
                        <span
                          className={
                            s.balance > 0
                              ? "text-red-400 font-medium"
                              : s.balance < 0
                                ? "text-primary font-medium"
                                : "text-foreground"
                          }
                        >
                          {formatMoney(Math.abs(s.balance))}
                          {s.balance > 0
                            ? " (مدين)"
                            : s.balance < 0
                              ? " (دائن)"
                              : ""}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={s.isActive ? "success" : "secondary"}
                        >
                          {s.isActive ? "نشط" : "غير نشط"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => openEditDialog(s)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-400 hover:text-red-300"
                            onClick={() => handleDelete(s.id)}
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
                {total} مورد — صفحة {filters.page} من {totalPages}
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

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "تعديل المورد" : "إضافة مورد"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>الاسم</Label>
              <Input
                value={form.name}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="اسم المورد"
              />
            </div>
            <div className="space-y-2">
              <Label>الهاتف</Label>
              <Input
                value={form.phone}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, phone: e.target.value }))
                }
                placeholder="05XXXXXXXX"
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label>البريد الإلكتروني</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, email: e.target.value }))
                }
                placeholder="supplier@example.com"
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label>حد الائتمان (ر.س)</Label>
              <Input
                type="number"
                value={form.creditLimit}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, creditLimit: e.target.value }))
                }
                placeholder="0.00"
                min="0"
                dir="ltr"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              <X className="ml-2 h-4 w-4" />
              إلغاء
            </Button>
            <Button
              className="bg-primary hover:bg-primary/80 text-white"
              onClick={handleSave}
              disabled={saving || !form.name}
            >
              {saving ? "جاري الحفظ..." : "حفظ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Receipt,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface Expense {
  id: string;
  date: string;
  description: string;
  categoryName: string;
  amount: number;
  paymentMethod: string;
  status: string;
}

interface Filters {
  search: string;
  category: string;
  dateFrom: string;
  dateTo: string;
  page: number;
  pageSize: number;
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

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("ar-SA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const paymentMethodLabels: Record<string, string> = {
  cash: "نقدي",
  card: "بطاقة",
  transfer: "تحويل",
  credit: "آجل",
};

const statusLabels: Record<string, { label: string; variant: "success" | "secondary" | "destructive" }> = {
  pending: { label: "معلق", variant: "secondary" },
  approved: { label: "معتمد", variant: "success" },
  rejected: { label: "مرفوض", variant: "destructive" },
};

const emptyForm = {
  description: "",
  category: "",
  amount: "",
  paymentMethod: "cash",
};

export default function SamaCenterExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({
    search: "",
    category: "",
    dateFrom: "",
    dateTo: "",
    page: 1,
    pageSize: 20,
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.search) params.set("search", filters.search);
      if (filters.category) params.set("category", filters.category);
      if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
      if (filters.dateTo) params.set("dateTo", filters.dateTo);
      params.set("page", String(filters.page));
      params.set("pageSize", String(filters.pageSize));

      const res = await fetch(`/api/v1/sama-center/expenses?${params.toString()}`);
      const json = await res.json();
      if (json.ok) {
        setExpenses(json.data.items);
        setTotal(json.data.total);
      } else {
        setError("فشل تحميل المصروفات");
      }
    } catch {
      setError("فشل تحميل المصروفات");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  useEffect(() => {
    async function fetchCategories() {
      const res = await fetch("/api/v1/sama-center/expenses/categories");
      const json = await res.json();
      if (json.ok) setCategories(json.data);
    }
    fetchCategories();
  }, []);

  const totalPages = Math.ceil(total / filters.pageSize);

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  }

  function openCreateDialog() {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEditDialog(expense: Expense) {
    setEditingId(expense.id);
    setForm({
      description: expense.description,
      category: expense.categoryName,
      amount: String(expense.amount / 100),
      paymentMethod: expense.paymentMethod,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const url = editingId
        ? `/api/v1/sama-center/expenses/${editingId}`
        : "/api/v1/sama-center/expenses";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: form.description,
          category: form.category,
          amount: Math.round(Number(form.amount) * 100),
          paymentMethod: form.paymentMethod,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setDialogOpen(false);
        fetchExpenses();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("هل أنت متأكد من الحذف؟")) return;
    const res = await fetch(`/api/v1/sama-center/expenses/${id}`, {
      method: "DELETE",
    });
    const json = await res.json();
    if (json.ok) fetchExpenses();
  }

  return (
    <div dir="rtl" className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">المصروفات</h1>
          <p className="text-sm text-muted-foreground">
            إدارة مصروفات العيادة
          </p>
        </div>
        <Button
          className="bg-primary hover:bg-primary/80 text-white"
          onClick={openCreateDialog}
        >
          <Plus className="ml-2 h-4 w-4" />
          إضافة مصروف
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="بحث بالوصف..."
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
                <SelectValue placeholder="كل التصنيفات" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل التصنيفات</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => updateFilter("dateFrom", e.target.value)}
              className="w-full sm:w-40"
              dir="ltr"
            />
            <Input
              type="date"
              value={filters.dateTo}
              onChange={(e) => updateFilter("dateTo", e.target.value)}
              className="w-full sm:w-40"
              dir="ltr"
            />
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
          ) : expenses.length === 0 ? (
            <div className="flex h-48 items-center justify-center">
              <div className="text-center">
                <Receipt className="mx-auto h-10 w-10 text-muted-foreground" />
                <p className="mt-3 text-sm text-muted-foreground">
                  لا توجد مصروفات
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>التاريخ</TableHead>
                    <TableHead>الوصف</TableHead>
                    <TableHead>التصنيف</TableHead>
                    <TableHead>المبلغ</TableHead>
                    <TableHead>طريقة الدفع</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead className="text-left">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(e.date)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {e.description}
                      </TableCell>
                      <TableCell>{e.categoryName}</TableCell>
                      <TableCell className="text-red-400 font-medium">
                        {formatMoney(e.amount)}
                      </TableCell>
                      <TableCell>
                        {paymentMethodLabels[e.paymentMethod] ??
                          e.paymentMethod}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            (statusLabels[e.status]?.variant as
                              | "success"
                              | "destructive"
                              | "secondary") ?? "secondary"
                          }
                        >
                          {statusLabels[e.status]?.label ?? e.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => openEditDialog(e)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-400 hover:text-red-300"
                            onClick={() => handleDelete(e.id)}
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
                {total} مصروف — صفحة {filters.page} من {totalPages}
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
              {editingId ? "تعديل المصروف" : "إضافة مصروف"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>الوصف</Label>
              <Input
                value={form.description}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                placeholder="وصف المصروف"
              />
            </div>
            <div className="space-y-2">
              <Label>التصنيف</Label>
              <Input
                value={form.category}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, category: e.target.value }))
                }
                placeholder="تصنيف المصروف"
              />
            </div>
            <div className="space-y-2">
              <Label>المبلغ (ي.ع)</Label>
              <Input
                type="number"
                value={form.amount}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, amount: e.target.value }))
                }
                placeholder="0"
                min="0"
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label>طريقة الدفع</Label>
              <Select
                value={form.paymentMethod}
                onValueChange={(v) =>
                  setForm((prev) => ({ ...prev, paymentMethod: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">نقدي</SelectItem>
                  <SelectItem value="card">بطاقة</SelectItem>
                  <SelectItem value="transfer">تحويل</SelectItem>
                  <SelectItem value="credit">آجل</SelectItem>
                </SelectContent>
              </Select>
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
              disabled={saving || !form.description || !form.amount}
            >
              {saving ? "جاري الحفظ..." : "حفظ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

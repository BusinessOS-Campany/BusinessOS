"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  ClipboardList,
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

interface Coverage {
  id: string;
  employeeName: string;
  sessionType: string;
  date: string;
  price: number;
  therapistShare: number;
  timeRange: string;
}

interface Employee {
  id: string;
  name: string;
}

interface Filters {
  employee: string;
  month: string;
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

const sessionTypeLabels: Record<string, string> = {
  normal: "جلسة عادية",
  hijama: "حجامة",
};

const emptyForm = {
  employeeName: "",
  sessionType: "normal",
  date: "",
  price: "",
  therapistShare: "",
  timeRange: "",
};

export default function SamaCenterCoveragesPage() {
  const [coverages, setCoverages] = useState<Coverage[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({
    employee: "",
    month: "",
    page: 1,
    pageSize: 20,
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function fetchEmployees() {
      try {
        const res = await fetch("/api/v1/sama-center/employees");
        const json = await res.json();
        if (json.ok) {
          setEmployees(json.data.items ?? json.data);
        }
      } catch {
        /* silent */
      }
    }
    fetchEmployees();
  }, []);

  const fetchCoverages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.employee) params.set("employee", filters.employee);
      if (filters.month) params.set("month", filters.month);
      params.set("page", String(filters.page));
      params.set("pageSize", String(filters.pageSize));

      const res = await fetch(`/api/v1/sama-center/coverages?${params.toString()}`);
      const json = await res.json();
      if (json.ok) {
        setCoverages(json.data.items);
        setTotal(json.data.total);
      } else {
        setError("فشل تحميل التغطيات");
      }
    } catch {
      setError("فشل تحميل التغطيات");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchCoverages();
  }, [fetchCoverages]);

  const totalPages = Math.ceil(total / filters.pageSize);

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  }

  function openCreateDialog() {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEditDialog(coverage: Coverage) {
    setEditingId(coverage.id);
    setForm({
      employeeName: coverage.employeeName,
      sessionType: coverage.sessionType,
      date: coverage.date,
      price: String(coverage.price / 100),
      therapistShare: String(coverage.therapistShare / 100),
      timeRange: coverage.timeRange,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const url = editingId
        ? `/api/v1/sama-center/coverages/${editingId}`
        : "/api/v1/sama-center/coverages";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeName: form.employeeName,
          sessionType: form.sessionType,
          date: form.date,
          price: Math.round(Number(form.price) * 100),
          therapistShare: Math.round(Number(form.therapistShare) * 100),
          timeRange: form.timeRange,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setDialogOpen(false);
        fetchCoverages();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("هل أنت متأكد من الحذف؟")) return;
    const res = await fetch(`/api/v1/sama-center/coverages/${id}`, {
      method: "DELETE",
    });
    const json = await res.json();
    if (json.ok) fetchCoverages();
  }

  const currentMonth = new Date().toISOString().slice(0, 7);

  return (
    <div dir="rtl" className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">التغطيات</h1>
          <p className="text-sm text-muted-foreground">
            تتبع جلسات التغطية وال戶ibs
          </p>
        </div>
        <Button
          className="bg-primary hover:bg-primary/80 text-white"
          onClick={openCreateDialog}
        >
          <Plus className="ml-2 h-4 w-4" />
          إضافة تغطية
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Select
              value={filters.employee}
              onValueChange={(v) => updateFilter("employee", v)}
            >
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="كل الموظفين" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الموظفين</SelectItem>
                {employees.map((emp) => (
                  <SelectItem key={emp.id} value={emp.name}>
                    {emp.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="month"
              value={filters.month}
              onChange={(e) => updateFilter("month", e.target.value)}
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
          ) : coverages.length === 0 ? (
            <div className="flex h-48 items-center justify-center">
              <div className="text-center">
                <ClipboardList className="mx-auto h-10 w-10 text-muted-foreground" />
                <p className="mt-3 text-sm text-muted-foreground">
                  لا توجد تغطيات
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الموظف</TableHead>
                    <TableHead>نوع الجلسة</TableHead>
                    <TableHead>التاريخ</TableHead>
                    <TableHead>السعر</TableHead>
                    <TableHead>نصيب المعالج</TableHead>
                    <TableHead>الفترة</TableHead>
                    <TableHead className="text-left">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {coverages.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">
                        {c.employeeName}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {sessionTypeLabels[c.sessionType] ?? c.sessionType}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(c.date)}
                      </TableCell>
                      <TableCell className="text-primary font-medium">
                        {formatMoney(c.price)}
                      </TableCell>
                      <TableCell className="text-primary font-medium">
                        {formatMoney(c.therapistShare)}
                      </TableCell>
                      <TableCell className="text-xs" dir="ltr">
                        {c.timeRange}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => openEditDialog(c)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-400 hover:text-red-300"
                            onClick={() => handleDelete(c.id)}
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
                {total} تغطية — صفحة {filters.page} من {totalPages}
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
              {editingId ? "تعديل التغطية" : "إضافة تغطية جديدة"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>الموظف</Label>
              <Input
                value={form.employeeName}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, employeeName: e.target.value }))
                }
                placeholder="اسم الموظف"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>نوع الجلسة</Label>
                <Select
                  value={form.sessionType}
                  onValueChange={(v) =>
                    setForm((prev) => ({ ...prev, sessionType: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">جلسة عادية</SelectItem>
                    <SelectItem value="hijama">حجامة</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>التاريخ</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, date: e.target.value }))
                  }
                  dir="ltr"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>السعر (ي.ع)</Label>
                <Input
                  type="number"
                  value={form.price}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, price: e.target.value }))
                  }
                  placeholder="0"
                  min="0"
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label>نصيب المعالج (ي.ع)</Label>
                <Input
                  type="number"
                  value={form.therapistShare}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      therapistShare: e.target.value,
                    }))
                  }
                  placeholder="0"
                  min="0"
                  dir="ltr"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>الفترة الزمنية</Label>
              <Input
                value={form.timeRange}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, timeRange: e.target.value }))
                }
                placeholder="مثال: 09:00 - 12:00"
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
              disabled={saving || !form.employeeName || !form.date}
            >
              {saving ? "جاري الحفظ..." : "حفظ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

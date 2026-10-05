"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Search,
  Plus,
  CheckCircle,
  Activity,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  X,
  Stethoscope,
  Filter,
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

interface Session {
  id: string;
  patientName: string;
  type: string;
  date: string;
  price: number;
  status: string;
  paymentMethod: string;
  therapist: string;
  timeRange: string;
  notes: string;
}

interface Filters {
  search: string;
  status: string;
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

const typeLabels: Record<string, string> = {
  normal: "جلسة عادية",
  hijama: "حجامة",
};

const statusLabels: Record<string, { label: string; variant: "success" | "secondary" | "destructive" | "warning" }> = {
  progress: { label: "قيد التنفيذ", variant: "warning" },
  completed: { label: "مكتمل", variant: "success" },
  cancelled: { label: "ملغي", variant: "destructive" },
};

const paymentMethodLabels: Record<string, string> = {
  cash: "نقدي",
  card: "بطاقة",
  transfer: "تحويل",
  credit: "آجل",
};

const emptyForm = {
  patientName: "",
  type: "normal",
  date: "",
  price: "",
  paymentMethod: "cash",
  therapist: "",
  notes: "",
};

export default function SamaCenterSessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({
    search: "",
    status: "",
    dateFrom: "",
    dateTo: "",
    page: 1,
    pageSize: 20,
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.search) params.set("search", filters.search);
      if (filters.status) params.set("status", filters.status);
      if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
      if (filters.dateTo) params.set("dateTo", filters.dateTo);
      params.set("page", String(filters.page));
      params.set("pageSize", String(filters.pageSize));

      const res = await fetch(`/api/v1/sama-center/sessions?${params.toString()}`);
      const json = await res.json();
      if (json.ok) {
        setSessions(json.data.items);
        setTotal(json.data.total);
      } else {
        setError("فشل تحميل الجلسات");
      }
    } catch {
      setError("فشل تحميل الجلسات");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const totalPages = Math.ceil(total / filters.pageSize);

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  }

  function openCreateDialog() {
    setForm(emptyForm);
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/v1/sama-center/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientName: form.patientName,
          type: form.type,
          date: form.date,
          price: Math.round(Number(form.price) * 100),
          paymentMethod: form.paymentMethod,
          therapist: form.therapist,
          notes: form.notes,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setDialogOpen(false);
        fetchSessions();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateStatus(id: string, newStatus: string) {
    const res = await fetch(`/api/v1/sama-center/sessions/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    const json = await res.json();
    if (json.ok) fetchSessions();
  }

  return (
    <div dir="rtl" className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">الجلسات</h1>
          <p className="text-sm text-muted-foreground">
            إدارة جلسات العلاج والفحوصات
          </p>
        </div>
        <Button
          className="bg-primary hover:bg-primary/80 text-white"
          onClick={openCreateDialog}
        >
          <Plus className="ml-2 h-4 w-4" />
          إضافة جلسة
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="بحث بالاسم أو المعالج..."
                value={filters.search}
                onChange={(e) => updateFilter("search", e.target.value)}
                className="pr-9"
              />
            </div>
            <Select
              value={filters.status}
              onValueChange={(v) => updateFilter("status", v)}
            >
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="كل الحالات" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                <SelectItem value="progress">قيد التنفيذ</SelectItem>
                <SelectItem value="completed">مكتمل</SelectItem>
                <SelectItem value="cancelled">ملغي</SelectItem>
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
          ) : sessions.length === 0 ? (
            <div className="flex h-48 items-center justify-center">
              <div className="text-center">
                <Stethoscope className="mx-auto h-10 w-10 text-muted-foreground" />
                <p className="mt-3 text-sm text-muted-foreground">
                  لا توجد جلسات
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>المريض</TableHead>
                    <TableHead>النوع</TableHead>
                    <TableHead>التاريخ</TableHead>
                    <TableHead>المعالج</TableHead>
                    <TableHead>الفترة</TableHead>
                    <TableHead>السعر</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>طريقة الدفع</TableHead>
                    <TableHead className="text-left">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">
                        {s.patientName}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {typeLabels[s.type] ?? s.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(s.date)}
                      </TableCell>
                      <TableCell>{s.therapist}</TableCell>
                      <TableCell className="text-xs" dir="ltr">
                        {s.timeRange}
                      </TableCell>
                      <TableCell className="text-primary font-medium">
                        {formatMoney(s.price)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={statusLabels[s.status]?.variant ?? "secondary"}
                          className="text-xs"
                        >
                          {statusLabels[s.status]?.label ?? s.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {paymentMethodLabels[s.paymentMethod] ?? s.paymentMethod}
                      </TableCell>
                      <TableCell>
                        {s.status === "progress" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1 text-primary hover:text-primary/80"
                            onClick={() => handleUpdateStatus(s.id, "completed")}
                          >
                            <CheckCircle className="h-4 w-4" />
                            <span className="text-xs">إكمال</span>
                          </Button>
                        )}
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
                {total} جلسة — صفحة {filters.page} من {totalPages}
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

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>إضافة جلسة جديدة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>اسم المريض</Label>
              <Input
                value={form.patientName}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, patientName: e.target.value }))
                }
                placeholder="اسم المريض"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>نوع الجلسة</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) =>
                    setForm((prev) => ({ ...prev, type: v }))
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
            <div className="space-y-2">
              <Label>المعالج</Label>
              <Input
                value={form.therapist}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, therapist: e.target.value }))
                }
                placeholder="اسم المعالج"
              />
            </div>
            <div className="space-y-2">
              <Label>ملاحظات</Label>
              <Input
                value={form.notes}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, notes: e.target.value }))
                }
                placeholder="ملاحظات إضافية"
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
              disabled={saving || !form.patientName || !form.date}
            >
              {saving ? "جاري الحفظ..." : "حفظ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

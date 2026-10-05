"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Search,
  Plus,
  Activity,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  X,
  CalendarClock,
  CheckCircle,
  XCircle,
  Clock,
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

interface Appointment {
  id: string;
  patientName: string;
  phone: string;
  therapist: string;
  date: string;
  time: string;
  status: string;
  notes: string;
}

interface Filters {
  search: string;
  status: string;
  date: string;
  page: number;
  pageSize: number;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("ar-SA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const statusLabels: Record<string, { label: string; variant: "success" | "secondary" | "destructive" | "warning"; icon: React.ComponentType<{ className?: string }> }> = {
  pending: { label: "معلق", variant: "warning", icon: Clock },
  confirmed: { label: "مؤكد", variant: "success", icon: CheckCircle },
  completed: { label: "مكتمل", variant: "secondary", icon: CheckCircle },
  cancelled: { label: "ملغي", variant: "destructive", icon: XCircle },
  "no-show": { label: "لم يحضر", variant: "destructive", icon: XCircle },
};

const emptyForm = {
  patientName: "",
  phone: "",
  therapist: "",
  date: "",
  time: "",
  notes: "",
};

export default function SamaCenterAppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({
    search: "",
    status: "",
    date: "",
    page: 1,
    pageSize: 20,
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const fetchAppointments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.search) params.set("search", filters.search);
      if (filters.status) params.set("status", filters.status);
      if (filters.date) params.set("date", filters.date);
      params.set("page", String(filters.page));
      params.set("pageSize", String(filters.pageSize));

      const res = await fetch(`/api/v1/sama-center/appointments?${params.toString()}`);
      const json = await res.json();
      if (json.ok) {
        setAppointments(json.data.items);
        setTotal(json.data.total);
      } else {
        setError("فشل تحميل المواعيد");
      }
    } catch {
      setError("فشل تحميل المواعيد");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) fetchAppointments();
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [fetchAppointments]);

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
      const res = await fetch("/api/v1/sama-center/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientName: form.patientName,
          phone: form.phone,
          therapist: form.therapist,
          date: form.date,
          time: form.time,
          notes: form.notes,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setDialogOpen(false);
        fetchAppointments();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateStatus(id: string, newStatus: string) {
    const res = await fetch(`/api/v1/sama-center/appointments/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    const json = await res.json();
    if (json.ok) fetchAppointments();
  }

  return (
    <div dir="rtl" className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">المواعيد</h1>
          <p className="text-sm text-muted-foreground">
            إدارة مواعيد المرضى
          </p>
        </div>
        <Button
          className="bg-primary hover:bg-primary/80 text-white"
          onClick={openCreateDialog}
        >
          <Plus className="ml-2 h-4 w-4" />
          إضافة موعد
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
                <SelectItem value="pending">معلق</SelectItem>
                <SelectItem value="confirmed">مؤكد</SelectItem>
                <SelectItem value="completed">مكتمل</SelectItem>
                <SelectItem value="cancelled">ملغي</SelectItem>
                <SelectItem value="no-show">لم يحضر</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={filters.date}
              onChange={(e) => updateFilter("date", e.target.value)}
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
          ) : appointments.length === 0 ? (
            <div className="flex h-48 items-center justify-center">
              <div className="text-center">
                <CalendarClock className="mx-auto h-10 w-10 text-muted-foreground" />
                <p className="mt-3 text-sm text-muted-foreground">
                  لا توجد مواعيد
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>المريض</TableHead>
                    <TableHead>الهاتف</TableHead>
                    <TableHead>المعالج</TableHead>
                    <TableHead>التاريخ</TableHead>
                    <TableHead>الوقت</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>ملاحظات</TableHead>
                    <TableHead className="text-left">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {appointments.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">
                        {a.patientName}
                      </TableCell>
                      <TableCell dir="ltr">{a.phone}</TableCell>
                      <TableCell>{a.therapist}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(a.date)}
                      </TableCell>
                      <TableCell dir="ltr">{a.time}</TableCell>
                      <TableCell>
                        <Badge
                          variant={statusLabels[a.status]?.variant ?? "secondary"}
                          className="text-xs"
                        >
                          {statusLabels[a.status]?.label ?? a.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[120px] truncate text-xs text-muted-foreground">
                        {a.notes || "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {a.status === "pending" && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 gap-1 text-primary hover:text-primary/80"
                                onClick={() => handleUpdateStatus(a.id, "confirmed")}
                              >
                                <CheckCircle className="h-3 w-3" />
                                <span className="text-[10px]">تأكيد</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 gap-1 text-red-400 hover:text-red-300"
                                onClick={() => handleUpdateStatus(a.id, "cancelled")}
                              >
                                <XCircle className="h-3 w-3" />
                                <span className="text-[10px]">إلغاء</span>
                              </Button>
                            </>
                          )}
                          {a.status === "confirmed" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 gap-1 text-primary hover:text-primary/80"
                              onClick={() => handleUpdateStatus(a.id, "completed")}
                            >
                              <CheckCircle className="h-3 w-3" />
                              <span className="text-[10px]">إكمال</span>
                            </Button>
                          )}
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
                {total} موعد — صفحة {filters.page} من {totalPages}
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
            <DialogTitle>إضافة موعد جديد</DialogTitle>
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
            <div className="space-y-2">
              <Label>الهاتف</Label>
              <Input
                value={form.phone}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, phone: e.target.value }))
                }
                placeholder="رقم الهاتف"
                dir="ltr"
              />
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
            <div className="grid grid-cols-2 gap-3">
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
              <div className="space-y-2">
                <Label>الوقت</Label>
                <Input
                  type="time"
                  value={form.time}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, time: e.target.value }))
                  }
                  dir="ltr"
                />
              </div>
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
              disabled={saving || !form.patientName || !form.date || !form.time}
            >
              {saving ? "جاري الحفظ..." : "حفظ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

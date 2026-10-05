"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Users,
  Activity,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  X,
  Eye,
  UserCheck,
  UserX,
  HeartPulse,
  Stethoscope,
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

interface Patient {
  id: string;
  serial: number;
  firstName: string;
  lastName: string;
  phone: string;
  gender: string;
  dateOfBirth: string;
  examType: string;
  price: number;
  status: string;
  notes: string;
  createdAt: string;
}

interface PatientStats {
  total: number;
  active: number;
  male: number;
  female: number;
}

interface Filters {
  search: string;
  status: string;
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

const statusLabels: Record<string, { label: string; variant: "success" | "secondary" | "destructive" | "warning" }> = {
  progress: { label: "قيد العلاج", variant: "warning" },
  completed: { label: "مكتمل", variant: "success" },
  cancelled: { label: "ملغي", variant: "destructive" },
};

const genderLabels: Record<string, string> = {
  male: "ذكر",
  female: "أنثى",
};

const examTypes = ["فحص عام", "علاج طبيعي", "حجامة", "إعادة تأهيل", "تقييم"];

const emptyForm = {
  firstName: "",
  lastName: "",
  phone: "",
  gender: "male",
  dateOfBirth: "",
  examType: "فحص عام",
  price: "",
  notes: "",
};

export default function SamaCenterPatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<PatientStats>({
    total: 0,
    active: 0,
    male: 0,
    female: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({
    search: "",
    status: "",
    page: 1,
    pageSize: 20,
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const fetchPatients = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.search) params.set("search", filters.search);
      if (filters.status) params.set("status", filters.status);
      params.set("page", String(filters.page));
      params.set("pageSize", String(filters.pageSize));

      const res = await fetch(`/api/v1/sama-center/patients?${params.toString()}`);
      const json = await res.json();
      if (json.ok) {
        setPatients(json.data.items);
        setTotal(json.data.total);
        if (json.data.stats) setStats(json.data.stats);
      } else {
        setError("فشل تحميل المرضى");
      }
    } catch {
      setError("فشل تحميل المرضى");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchPatients();
  }, [fetchPatients]);

  const totalPages = Math.ceil(total / filters.pageSize);

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  }

  function openCreateDialog() {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEditDialog(patient: Patient) {
    setEditingId(patient.id);
    setForm({
      firstName: patient.firstName,
      lastName: patient.lastName,
      phone: patient.phone,
      gender: patient.gender,
      dateOfBirth: patient.dateOfBirth ? patient.dateOfBirth.split("T")[0] : "",
      examType: patient.examType,
      price: String(patient.price / 100),
      notes: patient.notes,
    });
    setDialogOpen(true);
  }

  function openDetailDialog(patient: Patient) {
    setSelectedPatient(patient);
    setDetailOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const url = editingId
        ? `/api/v1/sama-center/patients/${editingId}`
        : "/api/v1/sama-center/patients";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          phone: form.phone,
          gender: form.gender,
          dateOfBirth: form.dateOfBirth || undefined,
          examType: form.examType,
          price: Math.round(Number(form.price) * 100),
          notes: form.notes,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setDialogOpen(false);
        fetchPatients();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("هل أنت متأكد من الحذف؟")) return;
    const res = await fetch(`/api/v1/sama-center/patients/${id}`, {
      method: "DELETE",
    });
    const json = await res.json();
    if (json.ok) fetchPatients();
  }

  return (
    <div dir="rtl" className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">المرضى</h1>
          <p className="text-sm text-muted-foreground">
            إدارة بيانات المرضى والسجلات
          </p>
        </div>
        <Button
          className="bg-primary hover:bg-primary/80 text-white"
          onClick={openCreateDialog}
        >
          <Plus className="ml-2 h-4 w-4" />
          إضافة مريض
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
               <div className="rounded-lg bg-primary/10 p-2">
                <Users className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-primary">{stats.total}</p>
                <p className="text-xs text-muted-foreground">إجمالي المرضى</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
               <div className="rounded-lg bg-success/10 p-2">
                <HeartPulse className="h-4 w-4 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold text-success">{stats.active}</p>
                <p className="text-xs text-muted-foreground">قيد العلاج</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
               <div className="rounded-lg bg-info/10 p-2">
                <UserCheck className="h-4 w-4 text-info" />
              </div>
              <div>
                <p className="text-2xl font-bold text-info">{stats.male}</p>
                <p className="text-xs text-muted-foreground">ذكور</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-pink-600/20 p-2">
                <UserX className="h-4 w-4 text-pink-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-pink-400">{stats.female}</p>
                <p className="text-xs text-muted-foreground">إناث</p>
              </div>
            </div>
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
                placeholder="بحث بالاسم أو الهاتف..."
                value={filters.search}
                onChange={(e) => updateFilter("search", e.target.value)}
                className="pr-9"
              />
            </div>
            <Select
              value={filters.status}
              onValueChange={(v) => updateFilter("status", v)}
            >
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="كل الحالات" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                <SelectItem value="progress">قيد العلاج</SelectItem>
                <SelectItem value="completed">مكتمل</SelectItem>
                <SelectItem value="cancelled">ملغي</SelectItem>
              </SelectContent>
            </Select>
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
          ) : patients.length === 0 ? (
            <div className="flex h-48 items-center justify-center">
              <div className="text-center">
                <Users className="mx-auto h-10 w-10 text-muted-foreground" />
                <p className="mt-3 text-sm text-muted-foreground">
                  لا يوجد مرضى
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>م.</TableHead>
                    <TableHead>الاسم</TableHead>
                    <TableHead>الهاتف</TableHead>
                    <TableHead>الجنس</TableHead>
                    <TableHead>نوع الفحص</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>تاريخ التسجيل</TableHead>
                    <TableHead className="text-left">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {patients.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">
                        {p.serial}
                      </TableCell>
                      <TableCell className="font-medium">
                        {p.firstName} {p.lastName}
                      </TableCell>
                      <TableCell dir="ltr">{p.phone}</TableCell>
                      <TableCell>{genderLabels[p.gender] ?? p.gender}</TableCell>
                      <TableCell>{p.examType}</TableCell>
                      <TableCell>
                        <Badge
                          variant={statusLabels[p.status]?.variant ?? "secondary"}
                          className="text-xs"
                        >
                          {statusLabels[p.status]?.label ?? p.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(p.createdAt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => openDetailDialog(p)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => openEditDialog(p)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-400 hover:text-red-300"
                            onClick={() => handleDelete(p.id)}
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
                {total} مريض — صفحة {filters.page} من {totalPages}
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
              {editingId ? "تعديل بيانات المريض" : "إضافة مريض جديد"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>الاسم الأول</Label>
                <Input
                  value={form.firstName}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, firstName: e.target.value }))
                  }
                  placeholder="الاسم الأول"
                />
              </div>
              <div className="space-y-2">
                <Label>اسم العائلة</Label>
                <Input
                  value={form.lastName}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, lastName: e.target.value }))
                  }
                  placeholder="اسم العائلة"
                />
              </div>
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>الجنس</Label>
                <Select
                  value={form.gender}
                  onValueChange={(v) =>
                    setForm((prev) => ({ ...prev, gender: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">ذكر</SelectItem>
                    <SelectItem value="female">أنثى</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>تاريخ الميلاد</Label>
                <Input
                  type="date"
                  value={form.dateOfBirth}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, dateOfBirth: e.target.value }))
                  }
                  dir="ltr"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>نوع الفحص</Label>
                <Select
                  value={form.examType}
                  onValueChange={(v) =>
                    setForm((prev) => ({ ...prev, examType: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {examTypes.map((et) => (
                      <SelectItem key={et} value={et}>
                        {et}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
              disabled={saving || !form.firstName || !form.phone}
            >
              {saving ? "جاري الحفظ..." : "حفظ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>بيانات المريض</DialogTitle>
          </DialogHeader>
          {selectedPatient && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">الاسم</p>
                  <p className="text-sm font-medium">
                    {selectedPatient.firstName} {selectedPatient.lastName}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">الهاتف</p>
                  <p className="text-sm font-medium" dir="ltr">
                    {selectedPatient.phone}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">الجنس</p>
                  <p className="text-sm font-medium">
                    {genderLabels[selectedPatient.gender] ?? selectedPatient.gender}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">تاريخ الميلاد</p>
                  <p className="text-sm font-medium">
                    {selectedPatient.dateOfBirth
                      ? formatDate(selectedPatient.dateOfBirth)
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">نوع الفحص</p>
                  <p className="text-sm font-medium">{selectedPatient.examType}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">السعر</p>
                  <p className="text-sm font-medium text-primary">
                    {formatMoney(selectedPatient.price)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">الحالة</p>
                  <Badge variant={statusLabels[selectedPatient.status]?.variant ?? "secondary"}>
                    {statusLabels[selectedPatient.status]?.label ?? selectedPatient.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">تاريخ التسجيل</p>
                  <p className="text-sm font-medium">
                    {formatDate(selectedPatient.createdAt)}
                  </p>
                </div>
              </div>
              {selectedPatient.notes && (
                <div>
                  <p className="text-xs text-muted-foreground">ملاحظات</p>
                  <p className="text-sm">{selectedPatient.notes}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailOpen(false)}>
              إغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Search, Truck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const fetchSuppliers = useCallback(async (q?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (q) params.set("q", q);
      const res = await fetch(`/api/v1/suppliers?${params}`);
      const json = await res.json();
      const data = json.data;
      setSuppliers(data?.suppliers ?? []);
    } catch {
      setSuppliers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/v1/suppliers?limit=50");
        const json = await res.json();
        const data = json.data;
        if (!cancelled) setSuppliers(data?.suppliers ?? []);
      } catch {
        if (!cancelled) setSuppliers([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchSuppliers(searchQuery || undefined);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery, fetchSuppliers]);

  function resetForm() {
    setFormName("");
    setFormPhone("");
    setFormNotes("");
    setFormError(null);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!formName.trim()) {
      setFormError("اسم المورد مطلوب");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/suppliers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          phone: formPhone.trim() || undefined,
          notes: formNotes.trim() || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setDialogOpen(false);
        resetForm();
        void fetchSuppliers(searchQuery || undefined);
      } else {
        setFormError(json?.error?.messageEn ?? json?.error?.message ?? `Error ${res.status}`);
      }
    } catch {
      setFormError("حدث خطأ في الاتصال");
    } finally {
      setSubmitting(false);
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("ar-SA", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">الموردين / Suppliers</h1>
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="ms-1 h-4 w-4" />
              إضافة مورد / Add Supplier
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>إضافة مورد جديد</DialogTitle>
              <DialogDescription>أدخل بيانات المورد الجديد</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="supplier-name">اسم المورد *</Label>
                <Input
                  id="supplier-name"
                  placeholder="اسم المورد"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="supplier-phone">الهاتف</Label>
                <Input
                  id="supplier-phone"
                  type="tel"
                  placeholder="رقم الهاتف"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="supplier-notes">ملاحظات</Label>
                <textarea
                  id="supplier-notes"
                  placeholder="ملاحظات إضافية..."
                  rows={3}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="flex w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
              {formError && (
                <p className="text-sm text-red-400">{formError}</p>
              )}
              <DialogFooter>
                <Button type="submit" disabled={submitting}>
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "حفظ"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="بحث عن مورد..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pe-10"
        />
      </div>

      <div className="rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-right text-muted-foreground">الاسم</TableHead>
              <TableHead className="text-right text-muted-foreground">الهاتف</TableHead>
              <TableHead className="text-right text-muted-foreground">الحالة</TableHead>
              <TableHead className="text-right text-muted-foreground">تاريخ الإنشاء</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={`skeleton-${i}`} className="border-border">
                  <TableCell>
                    <div className="h-4 w-32 animate-pulse rounded bg-secondary" />
                  </TableCell>
                  <TableCell>
                    <div className="h-4 w-24 animate-pulse rounded bg-secondary" />
                  </TableCell>
                  <TableCell>
                    <div className="h-5 w-14 animate-pulse rounded-full bg-secondary" />
                  </TableCell>
                  <TableCell>
                    <div className="h-4 w-20 animate-pulse rounded bg-secondary" />
                  </TableCell>
                </TableRow>
              ))
            ) : suppliers.length === 0 ? (
              <TableRow className="border-border">
                <TableCell colSpan={4}>
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Truck className="mb-3 h-10 w-10 text-muted-foreground" />
                    <p className="text-sm">لا يوجد موردين</p>
                    <p className="text-xs text-muted-foreground">ابدأ بإضافة مورد جديد</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              suppliers.map((s) => (
                <TableRow key={s.id} className="border-border">
                  <TableCell className="font-medium text-foreground">{s.name}</TableCell>
                  <TableCell className="text-muted-foreground">{s.phone ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={s.isActive ? "success" : "secondary"}>
                      {s.isActive ? "نشط" : "غير نشط"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(s.createdAt)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

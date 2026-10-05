"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Search, Plus, Users } from "lucide-react";

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  creditLimit: number;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
}

function formatSAR(amount: number): string {
  return new Intl.NumberFormat("ar-SA", {
    style: "currency",
    currency: "SAR",
  }).format(amount / 100);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("ar-SA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formCreditLimit, setFormCreditLimit] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formError, setFormError] = useState("");

  const fetchCustomers = async (query: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (query) params.set("q", query);
      const res = await fetch(`/api/v1/customers?${params.toString()}`);
      const json = await res.json();
      const data = json.data;
      setCustomers(data?.customers ?? []);
    } catch {
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCustomers(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const resetForm = () => {
    setFormName("");
    setFormPhone("");
    setFormEmail("");
    setFormCreditLimit("");
    setFormNotes("");
    setFormError("");
  };

  const handleCreate = async () => {
    if (!formName.trim()) {
      setFormError("الاسم مطلوب");
      return;
    }
    setCreating(true);
    setFormError("");
    try {
      const body: Record<string, unknown> = { name: formName.trim() };
      if (formPhone.trim()) body.phone = formPhone.trim();
      if (formEmail.trim()) body.email = formEmail.trim();
      if (formCreditLimit.trim()) {
        body.creditLimit = Math.round(parseFloat(formCreditLimit) * 100);
      }
      if (formNotes.trim()) body.notes = formNotes.trim();

      const res = await fetch("/api/v1/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setFormError(json.error ?? "حدث خطأ أثناء إنشاء العميل");
        return;
      }
      setDialogOpen(false);
      resetForm();
      fetchCustomers(search);
    } catch {
      setFormError("حدث خطأ أثناء الاتصال بالخادم");
    } finally {
      setCreating(false);
    }
  };

  const filtered = customers.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.phone && c.phone.includes(q)) ||
      (c.email && c.email.toLowerCase().includes(q))
    );
  });

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            العملاء / Customers
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            إدارة بيانات العملاء وحدود الائتمان
          </p>
        </div>
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
          }}
        >
          <DialogTrigger asChild>
            <Button className="bg-primary text-white hover:bg-primary/90">
              <Plus className="ml-2 h-4 w-4" />
              إضافة عميل / Add Customer
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>إضافة عميل جديد</DialogTitle>
              <DialogDescription>
                أدخل بيانات العميل. الحقول المؤشر عليها مطلوبة.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label htmlFor="name">
                  الاسم <span className="text-red-400">*</span>
                </Label>
                <Input
                  id="name"
                  placeholder="اسم العميل"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="phone">الهاتف</Label>
                  <Input
                    id="phone"
                    placeholder="05XXXXXXXX"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="email">البريد الإلكتروني</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="email@example.com"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="creditLimit">حد الائتمان (ر.س)</Label>
                <Input
                  id="creditLimit"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={formCreditLimit}
                  onChange={(e) => setFormCreditLimit(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="notes">ملاحظات</Label>
                <Textarea
                  id="notes"
                  placeholder="ملاحظات إضافية..."
                  rows={3}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                />
              </div>
              {formError && (
                <p className="text-sm text-red-400">{formError}</p>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={creating}
              >
                إلغاء
              </Button>
              <Button
                onClick={handleCreate}
                disabled={creating}
                className="bg-primary text-white hover:bg-primary/90"
              >
                {creating ? "جاري الحفظ..." : "حفظ"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="بحث بالاسم أو الهاتف أو البريد..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pr-9"
        />
      </div>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-border">
              <TableHead className="text-right">الاسم</TableHead>
              <TableHead className="text-right">الهاتف</TableHead>
              <TableHead className="text-right">البريد</TableHead>
              <TableHead className="text-right">حد الائتمان</TableHead>
              <TableHead className="text-right">الحالة</TableHead>
              <TableHead className="text-right">تاريخ الإنشاء</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <div className="h-4 w-32 animate-pulse rounded bg-secondary" />
                  </TableCell>
                  <TableCell>
                    <div className="h-4 w-24 animate-pulse rounded bg-secondary" />
                  </TableCell>
                  <TableCell>
                    <div className="h-4 w-36 animate-pulse rounded bg-secondary" />
                  </TableCell>
                  <TableCell>
                    <div className="h-4 w-20 animate-pulse rounded bg-secondary" />
                  </TableCell>
                  <TableCell>
                    <div className="h-5 w-14 animate-pulse rounded-full bg-secondary" />
                  </TableCell>
                  <TableCell>
                    <div className="h-4 w-24 animate-pulse rounded bg-secondary" />
                  </TableCell>
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Users className="mb-3 h-12 w-12 text-muted-foreground" />
                    <p className="text-sm font-medium text-muted-foreground">
                      {search
                        ? "لا توجد نتائج مطابقة للبحث"
                        : "لا يوجد عملاء بعد"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {search
                        ? "جرّب تغيير كلمات البحث"
                        : "ابدأ بإضافة أول عميل"}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell className="font-medium text-foreground">
                    {customer.name}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {customer.phone ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {customer.email ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {customer.creditLimit > 0
                      ? formatSAR(customer.creditLimit)
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {customer.isActive ? (
                      <Badge variant="success">نشط</Badge>
                    ) : (
                      <Badge variant="destructive">غير نشط</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(customer.createdAt)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

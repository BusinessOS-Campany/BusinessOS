"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckCheck, ClipboardList, Plus, Search, Trash2, XCircle } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { translateKey } from "@/lib/client-i18n";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { savePrescription, dispensePrescription, cancelPrescription } from "@/lib/actions/prescriptions";

type Row = {
  id: string;
  prescriptionNo: string;
  customer: string;
  doctor: string;
  issueDate: string;
  status: string;
  itemCount: number;
  summary: string;
};

type RxLine = { medicineId: string; quantity: number; dosage: string; frequency: string };

const STATUS: Record<string, { ar: string; en: string; variant: "secondary" | "warning" | "success" | "destructive" }> = {
  pending: { ar: "قيد الانتظار", en: "Pending", variant: "warning" },
  dispensed: { ar: "تم الصرف", en: "Dispensed", variant: "success" },
  partial: { ar: "صرف جزئي", en: "Partial", variant: "secondary" },
  cancelled: { ar: "ملغي", en: "Cancelled", variant: "destructive" },
};

export function PrescriptionsClient({
  locale,
  rows,
  medicines,
  customers,
  doctors,
}: {
  locale: Locale;
  rows: Row[];
  medicines: Array<{ id: string; name: string; nameAr: string }>;
  customers: Array<{ id: string; name: string }>;
  doctors: Array<{ id: string; name: string; specialty: string | null }>;
}) {
  const t = (k: string) => translateKey(locale, k);
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"all" | "pending" | "dispensed" | "cancelled">("all");
  const [open, setOpen] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<RxLine[]>([]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (tab !== "all" && r.status !== tab) return false;
      if (q && !r.prescriptionNo.toLowerCase().includes(q) && !r.customer.toLowerCase().includes(q) && !r.summary.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, tab, query]);

  const medName = (id: string) => {
    const m = medicines.find((x) => x.id === id);
    return m ? (locale === "ar" && m.nameAr ? m.nameAr : m.name) : "";
  };

  function addLine() {
    setLines((l) => [...l, { medicineId: "", quantity: 1, dosage: "", frequency: "" }]);
  }
  function updateLine(idx: number, patch: Partial<RxLine>) {
    setLines((l) => l.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  }

  function submit() {
    if (lines.length === 0 || lines.some((l) => !l.medicineId)) {
      toast.error(locale === "ar" ? "أضف أصناف الوصفة" : "Add prescription items");
      return;
    }
    startTransition(async () => {
      try {
        await savePrescription({
          customerId: customerId || null,
          doctorId: doctorId || null,
          notes: notes || null,
          items: lines.map((l) => ({
            medicineId: l.medicineId,
            medicineName: medName(l.medicineId),
            quantity: l.quantity,
            dosage: l.dosage || null,
            frequency: l.frequency || null,
            duration: null,
          })),
        });
        toast.success(locale === "ar" ? "تم حفظ الوصفة" : "Prescription saved");
        setOpen(false);
        setLines([]);
        setCustomerId("");
        setDoctorId("");
        setNotes("");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("common.unpublished"));
      }
    });
  }

  function dispense(id: string) {
    startTransition(async () => {
      try {
        const res = await dispensePrescription(id);
        toast.success(locale === "ar" ? `تم الصرف — فاتورة ${res.invoiceNumber}` : `Dispensed — invoice ${res.invoiceNumber}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("common.unpublished"));
      }
    });
  }

  function cancel(id: string) {
    if (!confirm(locale === "ar" ? "إلغاء هذه الوصفة؟" : "Cancel this prescription?")) return;
    startTransition(async () => {
      await cancelPrescription(id);
      toast.success(t("common.deleted"));
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={locale === "ar" ? "الوصفات الطبية" : "Prescriptions"}
        description={locale === "ar" ? "تسجيل وصرف الوصفات" : "Record and dispense prescriptions"}
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus /> {locale === "ar" ? "وصفة جديدة" : "New prescription"}
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="all">{locale === "ar" ? "الكل" : "All"}</TabsTrigger>
            <TabsTrigger value="pending">{locale === "ar" ? "قيد الانتظار" : "Pending"}</TabsTrigger>
            <TabsTrigger value="dispensed">{locale === "ar" ? "تم الصرف" : "Dispensed"}</TabsTrigger>
            <TabsTrigger value="cancelled">{locale === "ar" ? "ملغاة" : "Cancelled"}</TabsTrigger>
          </TabsList>
          <div className="relative max-w-sm">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="ps-9" placeholder={t("common.searchPlaceholder")} value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>

        <TabsContent value={tab} className="mt-4">
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{locale === "ar" ? "الوصفة" : "RX no"}</TableHead>
                  <TableHead>{locale === "ar" ? "العميل" : "Customer"}</TableHead>
                  <TableHead>{locale === "ar" ? "الطبيب" : "Doctor"}</TableHead>
                  <TableHead>{locale === "ar" ? "التاريخ" : "Date"}</TableHead>
                  <TableHead>{locale === "ar" ? "الأصناف" : "Items"}</TableHead>
                  <TableHead>{locale === "ar" ? "الحالة" : "Status"}</TableHead>
                  <TableHead className="text-end">{locale === "ar" ? "إجراءات" : "Actions"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      {locale === "ar" ? "لا توجد وصفات" : "No prescriptions"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((r) => {
                    const st = STATUS[r.status] ?? STATUS.pending;
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.prescriptionNo}</TableCell>
                        <TableCell>{r.customer}</TableCell>
                        <TableCell>{r.doctor}</TableCell>
                        <TableCell>{new Date(r.issueDate).toLocaleDateString(locale === "ar" ? "ar-YE" : "en-GB")}</TableCell>
                        <TableCell className="max-w-56 truncate text-muted-foreground">{r.summary}</TableCell>
                        <TableCell><Badge variant={st.variant}>{locale === "ar" ? st.ar : st.en}</Badge></TableCell>
                        <TableCell className="text-end">
                          <div className="flex items-center justify-end gap-1">
                            {r.status === "pending" && (
                              <Button size="sm" variant="outline" onClick={() => dispense(r.id)} disabled={pending}>
                                <CheckCheck /> {locale === "ar" ? "صرف" : "Dispense"}
                              </Button>
                            )}
                            {r.status === "pending" && (
                              <Button size="iconSm" variant="ghost" onClick={() => cancel(r.id)}><XCircle className="text-destructive" /></Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{locale === "ar" ? "وصفة جديدة" : "New prescription"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{locale === "ar" ? "العميل" : "Customer"}</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{locale === "ar" ? "الطبيب" : "Doctor"}</Label>
              <Select value={doctorId} onValueChange={setDoctorId}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {doctors.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}{d.specialty ? ` — ${d.specialty}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{locale === "ar" ? "الأصناف" : "Items"} *</Label>
              <Button size="sm" variant="outline" onClick={addLine}><Plus /> {locale === "ar" ? "إضافة صنف" : "Add item"}</Button>
            </div>
            {lines.length === 0 ? (
              <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
                <ClipboardList className="mx-auto mb-1 h-5 w-5" /> {locale === "ar" ? "أضف أصناف الوصفة" : "Add prescription items"}
              </p>
            ) : (
              <div className="space-y-2">
                {lines.map((line, idx) => (
                  <div key={idx} className="grid grid-cols-12 items-center gap-2">
                    <div className="col-span-4">
                      <Select value={line.medicineId} onValueChange={(v) => updateLine(idx, { medicineId: v })}>
                        <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          {medicines.map((m) => (
                            <SelectItem key={m.id} value={m.id}>{locale === "ar" && m.nameAr ? m.nameAr : m.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Input className="col-span-2" type="number" min={1} placeholder={locale === "ar" ? "الكمية" : "Qty"} value={line.quantity}
                      onChange={(e) => updateLine(idx, { quantity: Number(e.target.value) })} />
                    <Input className="col-span-3" placeholder={locale === "ar" ? "الجرعة" : "Dosage"} value={line.dosage}
                      onChange={(e) => updateLine(idx, { dosage: e.target.value })} />
                    <Input className="col-span-2" placeholder={locale === "ar" ? "التكرار" : "Frequency"} value={line.frequency}
                      onChange={(e) => updateLine(idx, { frequency: e.target.value })} />
                    <Button className="col-span-1" size="iconSm" variant="ghost" onClick={() => setLines((l) => l.filter((_, i) => i !== idx))}>
                      <Trash2 className="text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>{locale === "ar" ? "ملاحظات" : "Notes"}</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={submit} disabled={pending}>{t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
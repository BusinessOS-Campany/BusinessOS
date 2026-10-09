"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil, Pill, Plus, Search, Trash2 } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { translateKey } from "@/lib/client-i18n";
import { fmtMoney, fmtNumber } from "@/lib/format";
import { saveMedicine, deleteMedicine, type MedicineInput } from "@/lib/actions/medicines";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

type Medicine = {
  id: string;
  nameAr: string;
  nameEn: string | null;
  genericName: string | null;
  strength: string | null;
  dosageForm: string | null;
  medicineType: string;
  categoryId: string | null;
  manufacturerId: string | null;
  sku: string | null;
  barcode: string | null;
  unit: string;
  minStock: number | null;
  reorderLevel: number | null;
  purchasePrice: number;
  salePrice: number;
  wholesalePrice: number | null;
  requiresPrescription: boolean;
  controlled: boolean;
  isActive: boolean;
  description: string | null;
  categoryName: string | null;
  manufacturerName: string | null;
  stock: number;
};

const DOSAGE_FORMS = ["tablet", "capsule", "syrup", "injection", "cream", "ointment", "drops", "spray", "suppository", "powder", "solution", "inhaler", "other"];
const FORMS_AR: Record<string, string> = {
  tablet: "أقراص", capsule: "كبسولات", syrup: "شراب", injection: "حقن", cream: "كريم", ointment: "مرهم",
  drops: "قطرات", spray: "بخاخ", suppository: "تحاميل", powder: "مسحوق", solution: "محلول", inhaler: "بخاخ استنشاق", other: "أخرى",
};

const emptyForm: MedicineInput = {
  nameAr: "", nameEn: "", genericName: "", strength: "", dosageForm: "tablet", medicineType: "otc",
  categoryId: "", manufacturerId: "", sku: "", barcode: "", unit: "pack", minStock: 20, reorderLevel: 50,
  purchasePrice: 0, salePrice: 0, wholesalePrice: null, requiresPrescription: false, controlled: false,
  isActive: true, description: "",
};

export function MedicinesClient({
  locale,
  medicines,
  categories,
  manufacturers,
}: {
  locale: Locale;
  medicines: Medicine[];
  categories: Array<{ id: string; nameAr: string; nameEn: string | null }>;
  manufacturers: Array<{ id: string; nameAr: string; nameEn: string | null }>;
}) {
  const t = (k: string) => translateKey(locale, k);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Medicine | null>(null);
  const [form, setForm] = useState<MedicineInput>(emptyForm);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return medicines;
    return medicines.filter(
      (m) =>
        m.nameAr.toLowerCase().includes(q) ||
        (m.nameEn ?? "").toLowerCase().includes(q) ||
        (m.genericName ?? "").toLowerCase().includes(q) ||
        (m.barcode ?? "").includes(q) ||
        (m.sku ?? "").toLowerCase().includes(q)
    );
  }, [medicines, query]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  }
  function openEdit(m: Medicine) {
    setEditing(m);
    setForm({ ...m, categoryId: m.categoryId ?? "", manufacturerId: m.manufacturerId ?? "" });
    setOpen(true);
  }

  function save() {
    if (!form.nameAr.trim()) {
      toast.error(locale === "ar" ? "الاسم العربي مطلوب" : "Arabic name is required");
      return;
    }
    startTransition(async () => {
      try {
        await saveMedicine(form);
        toast.success(t("common.saved"));
        setOpen(false);
      } catch {
        toast.error(t("common.unpublished"));
      }
    });
  }

  function remove(m: Medicine) {
    if (!confirm(t("common.deleteConfirm"))) return;
    startTransition(async () => {
      await deleteMedicine(m.id);
      toast.success(t("common.deleted"));
    });
  }

  const set = <K extends keyof MedicineInput>(k: K, v: MedicineInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("nav.medicines")}
        description={locale === "ar" ? "إدارة كتالوج الأدوية والأسعار" : "Manage medicine catalog and pricing"}
        actions={
          <Button onClick={openCreate}>
            <Plus /> {locale === "ar" ? "دواء جديد" : "New medicine"}
          </Button>
        }
      />

      <div className="relative max-w-sm">
        <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="ps-9" placeholder={t("common.searchPlaceholder")} value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Pill}
          title={locale === "ar" ? "لا توجد أدوية" : "No medicines"}
          description={locale === "ar" ? "ابدأ بإضافة أول دواء إلى الكتالوج." : "Add your first medicine to the catalog."}
          action={<Button onClick={openCreate}><Plus /> {locale === "ar" ? "إضافة" : "Add"}</Button>}
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{locale === "ar" ? "الدواء" : "Medicine"}</TableHead>
                <TableHead>{locale === "ar" ? "المادة الفعالة" : "Generic"}</TableHead>
                <TableHead>{locale === "ar" ? "الفئة" : "Category"}</TableHead>
                <TableHead className="text-end">{locale === "ar" ? "المخزون" : "Stock"}</TableHead>
                <TableHead className="text-end">{locale === "ar" ? "سعر البيع" : "Sale"}</TableHead>
                <TableHead>{locale === "ar" ? "النوع" : "Type"}</TableHead>
                <TableHead className="text-end">{t("common.edit") ?? ""}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <div className="font-medium">{m.nameAr}</div>
                    <div className="text-xs text-muted-foreground">
                      {m.nameEn} {m.strength ? `· ${m.strength}` : ""}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{m.genericName ?? "—"}</TableCell>
                  <TableCell className="text-sm">{m.categoryName ?? "—"}</TableCell>
                  <TableCell className="text-end">
                    <Badge variant={m.stock <= 0 ? "destructive" : m.stock <= (m.reorderLevel ?? 0) ? "warning" : "secondary"}>
                      {fmtNumber(m.stock)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-end font-medium">{fmtMoney(BigInt(Math.round(m.salePrice * 100)), locale)}</TableCell>
                  <TableCell>
                    {m.medicineType === "rx" ? (
                      <Badge variant="destructive">Rx</Badge>
                    ) : m.medicineType === "controlled" ? (
                      <Badge variant="warning">{locale === "ar" ? "مقيّد" : "Controlled"}</Badge>
                    ) : (
                      <Badge variant="secondary">OTC</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-end">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="iconSm" onClick={() => openEdit(m)}>
                        <Pencil />
                      </Button>
                      <Button variant="ghost" size="iconSm" onClick={() => remove(m)}>
                        <Trash2 className="text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? (locale === "ar" ? "تعديل دواء" : "Edit medicine") : locale === "ar" ? "دواء جديد" : "New medicine"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{locale === "ar" ? "الاسم (عربي)" : "Name (Arabic)"} *</Label>
              <Input value={form.nameAr} onChange={(e) => set("nameAr", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{locale === "ar" ? "الاسم (إنجليزي)" : "Name (English)"}</Label>
              <Input value={form.nameEn ?? ""} onChange={(e) => set("nameEn", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{locale === "ar" ? "المادة الفعالة" : "Generic name"}</Label>
              <Input value={form.genericName ?? ""} onChange={(e) => set("genericName", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{locale === "ar" ? "التركيز" : "Strength"}</Label>
              <Input value={form.strength ?? ""} onChange={(e) => set("strength", e.target.value)} placeholder="500mg" />
            </div>
            <div className="space-y-2">
              <Label>{locale === "ar" ? "الشكل الدوائي" : "Dosage form"}</Label>
              <Select value={form.dosageForm ?? ""} onValueChange={(v) => set("dosageForm", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOSAGE_FORMS.map((f) => (
                    <SelectItem key={f} value={f}>{locale === "ar" ? FORMS_AR[f] : f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{locale === "ar" ? "النوع" : "Type"}</Label>
              <Select value={form.medicineType} onValueChange={(v) => set("medicineType", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="otc">OTC</SelectItem>
                  <SelectItem value="rx">Rx</SelectItem>
                  <SelectItem value="controlled">{locale === "ar" ? "مقيّد" : "Controlled"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{locale === "ar" ? "الفئة" : "Category"}</Label>
              <Select value={form.categoryId ?? ""} onValueChange={(v) => set("categoryId", v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nameAr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{locale === "ar" ? "الشركة المصنعة" : "Manufacturer"}</Label>
              <Select value={form.manufacturerId ?? ""} onValueChange={(v) => set("manufacturerId", v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {manufacturers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.nameAr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{locale === "ar" ? "الباركود" : "Barcode"}</Label>
              <Input value={form.barcode ?? ""} onChange={(e) => set("barcode", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{locale === "ar" ? "رمز الصنف (SKU)" : "SKU"}</Label>
              <Input value={form.sku ?? ""} onChange={(e) => set("sku", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{locale === "ar" ? "سعر الشراء" : "Purchase price"}</Label>
              <Input type="number" step="0.01" value={form.purchasePrice} onChange={(e) => set("purchasePrice", Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label>{locale === "ar" ? "سعر البيع" : "Sale price"}</Label>
              <Input type="number" step="0.01" value={form.salePrice} onChange={(e) => set("salePrice", Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label>{locale === "ar" ? "الحد الأدنى للمخزون" : "Min stock"}</Label>
              <Input type="number" value={form.minStock ?? 0} onChange={(e) => set("minStock", Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label>{locale === "ar" ? "نقطة إعادة الطلب" : "Reorder level"}</Label>
              <Input type="number" value={form.reorderLevel ?? 0} onChange={(e) => set("reorderLevel", Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label>{locale === "ar" ? "الوحدة" : "Unit"}</Label>
              <Input value={form.unit} onChange={(e) => set("unit", e.target.value)} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label>{locale === "ar" ? "يتطلب وصفة" : "Requires prescription"}</Label>
              <Switch checked={form.requiresPrescription} onCheckedChange={(v) => set("requiresPrescription", v)} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label>{locale === "ar" ? "نشط" : "Active"}</Label>
              <Switch checked={form.isActive} onCheckedChange={(v) => set("isActive", v)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={save} disabled={pending}>{t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
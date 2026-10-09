"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowRightLeft, Search, Settings2 } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { translateKey } from "@/lib/client-i18n";
import { fmtNumber } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { adjustStock, transferStock } from "@/lib/actions/inventory";

type Row = {
  key: string;
  medicineId: string;
  name: string;
  barcode: string;
  warehouseId: string;
  warehouse: string;
  qty: number;
  reorder: number;
  low: boolean;
};

export function InventoryClient({
  locale,
  rows,
  warehouses,
}: {
  locale: Locale;
  rows: Row[];
  warehouses: Array<{ id: string; name: string }>;
}) {
  const t = (k: string) => translateKey(locale, k);
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [warehouse, setWarehouse] = useState("all");
  const [lowOnly, setLowOnly] = useState(false);
  const [adjustRow, setAdjustRow] = useState<Row | null>(null);
  const [adjustDelta, setAdjustDelta] = useState(0);
  const [adjustReason, setAdjustReason] = useState("");
  const [transferRow, setTransferRow] = useState<Row | null>(null);
  const [transferTo, setTransferTo] = useState("");
  const [transferQty, setTransferQty] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (warehouse !== "all" && r.warehouseId !== warehouse) return false;
      if (lowOnly && !r.low) return false;
      if (q && !r.name.toLowerCase().includes(q) && !r.barcode.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, query, warehouse, lowOnly]);

  function submitAdjust() {
    if (!adjustRow || adjustDelta === 0) {
      toast.error(locale === "ar" ? "أدخل قيمة التعديل" : "Enter an adjustment value");
      return;
    }
    if (adjustRow.qty + adjustDelta < 0) {
      toast.error(locale === "ar" ? "لا يمكن أن تقل الكمية عن الصفر" : "Cannot go below zero");
      return;
    }
    startTransition(async () => {
      try {
        await adjustStock({ medicineId: adjustRow.medicineId, warehouseId: adjustRow.warehouseId, delta: adjustDelta, reason: adjustReason || "manual" });
        toast.success(t("common.saved"));
        setAdjustRow(null);
        setAdjustDelta(0);
        setAdjustReason("");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("common.unpublished"));
      }
    });
  }

  function submitTransfer() {
    if (!transferRow || !transferTo) return;
    startTransition(async () => {
      try {
        await transferStock({ medicineId: transferRow.medicineId, fromWarehouseId: transferRow.warehouseId, toWarehouseId: transferTo, qty: transferQty });
        toast.success(locale === "ar" ? "تم التحويل" : "Transferred");
        setTransferRow(null);
        setTransferTo("");
        setTransferQty(1);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("common.unpublished"));
      }
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={locale === "ar" ? "المخزون" : "Inventory"}
        description={locale === "ar" ? "أرصدة المستودعات والتعديلات والتحويلات" : "Stock levels, adjustments and transfers"}
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="ps-9" placeholder={t("common.searchPlaceholder")} value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Select value={warehouse} onValueChange={setWarehouse}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{locale === "ar" ? "كل المستودعات" : "All warehouses"}</SelectItem>
            {warehouses.map((w) => (
              <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Switch id="low" checked={lowOnly} onCheckedChange={setLowOnly} />
          <Label htmlFor="low" className="cursor-pointer text-sm">{locale === "ar" ? "الأصناف المنخفضة فقط" : "Low stock only"}</Label>
        </div>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{locale === "ar" ? "الصنف" : "Item"}</TableHead>
              <TableHead>{locale === "ar" ? "الباركود" : "Barcode"}</TableHead>
              <TableHead>{locale === "ar" ? "المستودع" : "Warehouse"}</TableHead>
              <TableHead className="text-end">{locale === "ar" ? "الكمية" : "Qty"}</TableHead>
              <TableHead>{locale === "ar" ? "الحالة" : "Status"}</TableHead>
              <TableHead className="text-end">{locale === "ar" ? "إجراءات" : "Actions"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  {locale === "ar" ? "لا توجد سجلات" : "No records"}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={r.key}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-muted-foreground">{r.barcode || "—"}</TableCell>
                  <TableCell>{r.warehouse}</TableCell>
                  <TableCell className="text-end font-medium">{fmtNumber(r.qty)}</TableCell>
                  <TableCell>
                    {r.qty === 0 ? (
                      <Badge variant="destructive">{locale === "ar" ? "نفد المخزون" : "Out of stock"}</Badge>
                    ) : r.low ? (
                      <Badge variant="warning">{locale === "ar" ? "منخفض" : "Low"}</Badge>
                    ) : (
                      <Badge variant="success">{locale === "ar" ? "متوفر" : "In stock"}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-end">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="iconSm" variant="ghost" onClick={() => { setAdjustRow(r); setAdjustDelta(0); setAdjustReason(""); }} title={locale === "ar" ? "تعديل الكمية" : "Adjust qty"}>
                        <Settings2 />
                      </Button>
                      <Button size="iconSm" variant="ghost" onClick={() => { setTransferRow(r); setTransferTo(warehouses.find((w) => w.id !== r.warehouseId)?.id ?? ""); setTransferQty(1); }} title={locale === "ar" ? "تحويل" : "Transfer"}>
                        <ArrowRightLeft />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={Boolean(adjustRow)} onOpenChange={(o) => !o && setAdjustRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{locale === "ar" ? "تعديل الكمية" : "Adjust quantity"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {adjustRow?.name} • {adjustedHint(adjustRow?.qty ?? 0, adjustDelta, locale)}
            </p>
            <div className="space-y-2">
              <Label>{locale === "ar" ? "التغيير (موجب للإضافة، سالب للخصم)" : "Delta (positive to add, negative to deduct)"}</Label>
              <div className="flex items-center gap-2">
                <Input type="number" value={adjustDelta} onChange={(e) => setAdjustDelta(Number(e.target.value))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{locale === "ar" ? "السبب" : "Reason"}</Label>
              <Input value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} placeholder={locale === "ar" ? "تلف، انتهاء صلاحية، جرد..." : "damage, expiry, count..."} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustRow(null)}>{t("common.cancel")}</Button>
            <Button onClick={submitAdjust} disabled={pending}>{t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(transferRow)} onOpenChange={(o) => !o && setTransferRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{locale === "ar" ? "تحويل بين المستودعات" : "Warehouse transfer"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{transferRow?.name} — {transferRow?.warehouse} ({fmtNumber(transferRow?.qty ?? 0)})</p>
            <div className="space-y-2">
              <Label>{locale === "ar" ? "المستودع الوجهة" : "Destination"}</Label>
              <Select value={transferTo} onValueChange={setTransferTo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {warehouses.filter((w) => w.id !== transferRow?.warehouseId).map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{locale === "ar" ? "الكمية" : "Quantity"}</Label>
              <Input type="number" min={1} max={transferRow?.qty} value={transferQty} onChange={(e) => setTransferQty(Number(e.target.value))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferRow(null)}>{t("common.cancel")}</Button>
            <Button onClick={submitTransfer} disabled={pending}><ArrowRightLeft /> {locale === "ar" ? "تحويل" : "Transfer"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function adjustedHint(current: number, delta: number, locale: Locale) {
  const result = current + delta;
  if (locale === "ar") return `النتيجة: ${current} + (${delta}) = ${result}`;
  return `Result: ${current} + (${delta}) = ${result}`;
}
"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { PackagePlus, Plus, Search, Trash2 } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { translateKey } from "@/lib/client-i18n";
import { fmtMoney } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createPurchaseOrder, receivePurchase, cancelPurchase } from "@/lib/actions/purchases";

type POHolder = {
  id: string;
  poNumber: string;
  supplier: string;
  orderDate: string;
  status: string;
  total: number;
  itemCount: number;
};

type ReceiveLine = {
  id: string;
  purchaseOrderId: string;
  medicineId: string;
  medicineName: string;
  qty: number;
  receivedQty: number;
  remaining: number;
  unitCost: number;
};

const STATUS_BADGE: Record<string, { labelAr: string; labelEn: string; variant: "secondary" | "default" | "warning" | "success" | "destructive" }> = {
  draft: { labelAr: "مسودة", labelEn: "Draft", variant: "secondary" },
  ordered: { labelAr: "مُعلَّق", labelEn: "Ordered", variant: "warning" },
  partially_received: { labelAr: "استلام جزئي", labelEn: "Partial", variant: "warning" },
  received: { labelAr: "مُستلَم", labelEn: "Received", variant: "success" },
  cancelled: { labelAr: "ملغي", labelEn: "Cancelled", variant: "destructive" },
};

export function PurchasesClient({
  locale,
  rows,
  suppliers,
  warehouses,
  medicines,
  receivable,
}: {
  locale: Locale;
  rows: POHolder[];
  suppliers: Array<{ id: string; name: string; nameAr: string | null }>;
  warehouses: Array<{ id: string; name: string }>;
  medicines: Array<{ id: string; name: string; nameAr: string | null }>;
  receivable: ReceiveLine[];
}) {
  const t = (k: string) => translateKey(locale, k);
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [receiveId, setReceiveId] = useState<string | null>(null);

  const [supplierId, setSupplierId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Array<{ medicineId: string; quantity: number; unitCost: number; discount: number }>>([]);

  const [receiveLines, setReceiveLines] = useState<Record<string, { batchNo: string; expiry: string; qty: number; unitCost: number }>>({});
  const [receiveWarehouse, setReceiveWarehouse] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.poNumber.toLowerCase().includes(q) || r.supplier.toLowerCase().includes(q));
  }, [rows, query]);

  const orderTotal = lines.reduce((s, l) => s + (l.quantity || 0) * (l.unitCost || 0) - (l.quantity || 0) * (l.discount || 0), 0);

  function addLine() {
    setLines((l) => [...l, { medicineId: "", quantity: 1, unitCost: 0, discount: 0 }]);
  }
  function updateLine(idx: number, patch: Partial<(typeof lines)[number]>) {
    setLines((l) => l.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  }

  function submitCreate() {
    if (!supplierId || lines.length === 0 || lines.some((l) => !l.medicineId || l.quantity <= 0)) {
      toast.error(locale === "ar" ? "أكمل بيانات الطلب" : "Complete the order");
      return;
    }
    startTransition(async () => {
      try {
        await createPurchaseOrder({ supplierId, warehouseId, expectedDate: expectedDate || null, notes: notes || null, items: lines });
        toast.success(locale === "ar" ? "تم إنشاء الطلب" : "Purchase order created");
        setCreateOpen(false);
        setLines([]);
        setSupplierId("");
        setNotes("");
        setExpectedDate("");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("common.unpublished"));
      }
    });
  }

  const activeReceiveLines = useMemo(
    () => receivable.filter((r) => r.purchaseOrderId === receiveId && r.remaining > 0),
    [receivable, receiveId]
  );

  function openReceive(poId: string) {
    setReceiveId(poId);
    setReceiveWarehouse(warehouses[0]?.id ?? "");
    const init: Record<string, { batchNo: string; expiry: string; qty: number; unitCost: number }> = {};
    for (const r of receivable.filter((x) => x.purchaseOrderId === poId && x.remaining > 0)) {
      init[r.id] = { batchNo: "", expiry: "", qty: r.remaining, unitCost: r.unitCost };
    }
    setReceiveLines(init);
  }

  function submitReceive() {
    const items = activeReceiveLines
      .map((r) => ({
        purchaseItemId: r.id,
        medicineId: r.medicineId,
        batchNo: receiveLines[r.id]?.batchNo ?? "",
        qty: receiveLines[r.id]?.qty ?? 0,
        unitCost: receiveLines[r.id]?.unitCost ?? 0,
        expiryDate: receiveLines[r.id]?.expiry ?? "",
        mfgDate: null,
      }))
      .filter((i) => i.qty > 0);
    if (items.length === 0 || items.some((i) => !i.batchNo || !i.expiryDate)) {
      toast.error(locale === "ar" ? "أكمل بيانات الاستلام (الرقم الدفعي وتاريخ الانتهاء)" : "Complete batches and expiry dates");
      return;
    }
    startTransition(async () => {
      try {
        await receivePurchase({ purchaseId: receiveId!, warehouseId: receiveWarehouse, items });
        toast.success(locale === "ar" ? "تم استلام البضاعة" : "Stock received");
        setReceiveId(null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("common.unpublished"));
      }
    });
  }

  function submitCancel(id: string) {
    if (!confirm(locale === "ar" ? "إلغاء هذا الطلب؟" : "Cancel this order?")) return;
    startTransition(async () => {
      await cancelPurchase(id);
      toast.success(t("common.deleted"));
    });
  }

  const medicineName = (id: string) => {
    const m = medicines.find((x) => x.id === id);
    return m ? (locale === "ar" && m.nameAr ? m.nameAr : m.name) : "—";
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={locale === "ar" ? "مشتريات المخزون" : "Purchases"}
        description={locale === "ar" ? "أوامر الشراء والاستلام من الموردين" : "Purchase orders and receiving"}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <PackagePlus /> {locale === "ar" ? "طلب جديد" : "New PO"}
          </Button>
        }
      />

      <div className="relative max-w-sm">
        <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="ps-9" placeholder={t("common.searchPlaceholder")} value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{locale === "ar" ? "رقم الطلب" : "PO No"}</TableHead>
              <TableHead>{locale === "ar" ? "المورد" : "Supplier"}</TableHead>
              <TableHead>{locale === "ar" ? "التاريخ" : "Date"}</TableHead>
              <TableHead>{locale === "ar" ? "الأصناف" : "Items"}</TableHead>
              <TableHead className="text-end">{locale === "ar" ? "الإجمالي" : "Total"}</TableHead>
              <TableHead>{locale === "ar" ? "الحالة" : "Status"}</TableHead>
              <TableHead className="text-end">{locale === "ar" ? "إجراءات" : "Actions"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  {locale === "ar" ? "لا توجد طلبيات" : "No purchase orders"}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((po) => {
                const st = STATUS_BADGE[po.status] ?? STATUS_BADGE.draft;
                return (
                  <TableRow key={po.id}>
                    <TableCell className="font-medium">{po.poNumber}</TableCell>
                    <TableCell>{po.supplier}</TableCell>
                    <TableCell>{new Date(po.orderDate).toLocaleDateString(locale === "ar" ? "ar-YE" : "en-GB")}</TableCell>
                    <TableCell>{po.itemCount}</TableCell>
                    <TableCell className="text-end">{fmtMoney(BigInt(Math.round(po.total * 100)), locale)}</TableCell>
                    <TableCell>
                      <Badge variant={st.variant}>{locale === "ar" ? st.labelAr : st.labelEn}</Badge>
                    </TableCell>
                    <TableCell className="text-end">
                      <div className="flex items-center justify-end gap-1">
                        {(po.status === "ordered" || po.status === "partially_received") && (
                          <Button size="sm" variant="outline" onClick={() => openReceive(po.id)}>
                            {locale === "ar" ? "استلام" : "Receive"}
                          </Button>
                        )}
                        {po.status === "ordered" && (
                          <Button size="sm" variant="ghost" onClick={() => submitCancel(po.id)}>
                            <Trash2 className="text-destructive" />
                          </Button>
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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{locale === "ar" ? "طلب شراء جديد" : "New purchase order"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{locale === "ar" ? "المورد" : "Supplier"} *</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{locale === "ar" && s.nameAr ? s.nameAr : s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{locale === "ar" ? "المستودع" : "Warehouse"}</Label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{locale === "ar" ? "تاريخ التوريد المتوقع" : "Expected date"}</Label>
              <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{locale === "ar" ? "ملاحظات" : "Notes"}</Label>
              <Textarea className="min-h-[38px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{locale === "ar" ? "الأصناف" : "Items"} *</Label>
              <Button size="sm" variant="outline" onClick={addLine}><Plus /> {locale === "ar" ? "إضافة صنف" : "Add item"}</Button>
            </div>
            {lines.length === 0 ? (
              <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
                {locale === "ar" ? "أضف أصنافاً للطلب" : "Add items to the order"}
              </p>
            ) : (
              <div className="space-y-2">
                {lines.map((line, idx) => (
                  <div key={idx} className="grid grid-cols-12 items-center gap-2">
                    <div className="col-span-5">
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
                    <Input className="col-span-2" type="number" min={0} step="0.01" placeholder={locale === "ar" ? "سعر شراء" : "Cost"} value={line.unitCost}
                      onChange={(e) => updateLine(idx, { unitCost: Number(e.target.value) })} />
                    <Input className="col-span-2" type="number" min={0} step="0.01" placeholder={locale === "ar" ? "خصم" : "Disc"} value={line.discount}
                      onChange={(e) => updateLine(idx, { discount: Number(e.target.value) })} />
                    <Button className="col-span-1" size="iconSm" variant="ghost" onClick={() => setLines((l) => l.filter((_, i) => i !== idx))}>
                      <Trash2 className="text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between rounded-md bg-muted px-4 py-2 text-sm">
            <span>{locale === "ar" ? "الإجمالي" : "Total"}</span>
            <span className="font-semibold">{fmtMoney(BigInt(Math.round(orderTotal * 100)), locale)}</span>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={submitCreate} disabled={pending}>{locale === "ar" ? "حفظ الطلب" : "Save order"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(receiveId)} onOpenChange={(o) => !o && setReceiveId(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{locale === "ar" ? "استلام بضاعة" : "Receive stock"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <Label>{locale === "ar" ? "المستودع" : "Warehouse"}</Label>
            <Select value={receiveWarehouse} onValueChange={setReceiveWarehouse}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            {activeReceiveLines.map((r) => {
              const v = receiveLines[r.id] ?? { batchNo: "", expiry: "", qty: r.remaining, unitCost: r.unitCost };
              return (
                <div key={r.id} className="rounded-md border p-3">
                  <div className="mb-2 flex items-center justify-between text-sm font-medium">
                    <span>{medicineName(r.medicineId)}</span>
                    <span className="text-muted-foreground">{locale === "ar" ? "المتبقي" : "Remaining"}: {r.remaining}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <Input className="col-span-1" type="number" min={1} max={r.remaining} placeholder={locale === "ar" ? "الكمية" : "Qty"} value={v.qty}
                      onChange={(e) => setReceiveLines((m) => ({ ...m, [r.id]: { ...v, qty: Number(e.target.value) } }))} />
                    <Input className="col-span-1" placeholder={locale === "ar" ? "رقم الدفعة" : "Batch no"} value={v.batchNo}
                      onChange={(e) => setReceiveLines((m) => ({ ...m, [r.id]: { ...v, batchNo: e.target.value } }))} />
                    <Input className="col-span-1" type="date" placeholder="Expiry" value={v.expiry}
                      onChange={(e) => setReceiveLines((m) => ({ ...m, [r.id]: { ...v, expiry: e.target.value } }))} />
                    <Input className="col-span-1" type="number" step="0.01" placeholder={locale === "ar" ? "سعر" : "Cost"} value={v.unitCost}
                      onChange={(e) => setReceiveLines((m) => ({ ...m, [r.id]: { ...v, unitCost: Number(e.target.value) } }))} />
                  </div>
                </div>
              );
            })}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiveId(null)}>{t("common.cancel")}</Button>
            <Button onClick={submitReceive} disabled={pending}>{locale === "ar" ? "تأكيد الاستلام" : "Confirm receive"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
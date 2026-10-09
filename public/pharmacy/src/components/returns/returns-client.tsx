"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { PackageX, Plus, Trash2 } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { translateKey } from "@/lib/client-i18n";
import { fmtMoney } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { submitSalesReturn, submitSupplierReturn } from "@/lib/actions/returns";

type InvoiceOption = { id: string; invoiceNumber: string; issuedAt: string };
type InvoiceItemRow = { id: string; invoiceId: string; medicineId: string; batchId: string | null; name: string; qty: number; maxReturn: number; unitPrice: number };
type BatchOption = { id: string; medicineId: string; name: string; batchNo: string; remaining: number; unitCost: number };

export function ReturnsClient({
  locale,
  invoices,
  invoiceItems,
  suppliers,
  cashAccounts,
  batchOptions,
  salesReturns,
  supplierReturns,
}: {
  locale: Locale;
  invoices: InvoiceOption[];
  invoiceItems: InvoiceItemRow[];
  suppliers: Array<{ id: string; name: string; nameAr: string | null }>;
  cashAccounts: Array<{ id: string; name: string }>;
  batchOptions: BatchOption[];
  salesReturns: Array<{ id: string; returnNumber: string; invoiceNumber: string; total: number; reason: string; createdAt: string }>;
  supplierReturns: Array<{ id: string; returnNumber: string; supplier: string; total: number; reason: string; createdAt: string }>;
}) {
  const t = (k: string) => translateKey(locale, k);
  const [pending, startTransition] = useTransition();

  // Sales return
  const [invoiceId, setInvoiceId] = useState("");
  const [returnQtys, setReturnQtys] = useState<Record<string, number>>({});
  const [returnReason, setReturnReason] = useState("");
  const [cashAccountId, setCashAccountId] = useState("");

  // Supplier return
  const [supplierId, setSupplierId] = useState("");
  const [supReason, setSupReason] = useState("");
  const [supLines, setSupLines] = useState<Array<{ batchId: string; qty: number }>>([]);

  const selectedItems = useMemo(() => invoiceItems.filter((i) => i.invoiceId === invoiceId && i.maxReturn > 0), [invoiceItems, invoiceId]);

  const returnTotal = () => {
    let total = 0;
    for (const item of selectedItems) {
      const q = returnQtys[item.id] ?? 0;
      if (q > 0) total += q * item.unitPrice;
    }
    return total;
  };

  function submitSales() {
    const items = selectedItems
      .filter((i) => (returnQtys[i.id] ?? 0) > 0)
      .map((i) => ({
        salesInvoiceItemId: i.id,
        medicineId: i.medicineId,
        batchId: i.batchId,
        qty: returnQtys[i.id] ?? 0,
        unitPrice: i.unitPrice,
        lineTotal: (returnQtys[i.id] ?? 0) * i.unitPrice,
      }));
    if (items.length === 0) {
      toast.error(locale === "ar" ? "اختر أصنافاً للإرجاع" : "Select items to return");
      return;
    }
    startTransition(async () => {
      try {
        await submitSalesReturn({ invoiceId, reason: returnReason || null, cashAccountId: cashAccountId || null, items });
        toast.success(locale === "ar" ? "تم تسجيل المرتجع" : "Return recorded");
        setInvoiceId("");
        setReturnQtys({});
        setReturnReason("");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("common.unpublished"));
      }
    });
  }

  function addSupLine() {
    setSupLines((l) => [...l, { batchId: "", qty: 1 }]);
  }
  function updateSupLine(idx: number, patch: Partial<(typeof supLines)[number]>) {
    setSupLines((l) => l.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  }

  function submitSupplier() {
    const items = supLines
      .map((l) => {
        const b = batchOptions.find((x) => x.id === l.batchId);
        return b
          ? {
              medicineId: b.medicineId,
              batchId: b.id,
              qty: l.qty,
              unitCost: b.unitCost,
            }
          : null;
      })
      .filter(Boolean) as Array<{ medicineId: string; batchId: string; qty: number; unitCost: number }>;
    if (!supplierId || items.length === 0 || !supReason) {
      toast.error(locale === "ar" ? "أكمل بيانات المرتجع للمورد" : "Complete the supplier return");
      return;
    }
    startTransition(async () => {
      try {
        await submitSupplierReturn({ supplierId, purchaseId: null, reason: supReason, items });
        toast.success(locale === "ar" ? "تم تسجيل مرتجع المورد" : "Supplier return recorded");
        setSupplierId("");
        setSupReason("");
        setSupLines([]);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("common.unpublished"));
      }
    });
  }

  const batchFor = (id: string) => batchOptions.find((b) => b.id === id);

  return (
    <div className="space-y-6">
      <PageHeader
        title={locale === "ar" ? "المرتجعات" : "Returns"}
        description={locale === "ar" ? "مرتجعات المبيعات ومرتجعات الموردين" : "Sales and supplier returns"}
      />

      <Tabs defaultValue="sales">
        <TabsList>
          <TabsTrigger value="sales"><PackageX /> {locale === "ar" ? "مرتجعات المبيعات" : "Sales returns"}</TabsTrigger>
          <TabsTrigger value="supplier"><Plus /> {locale === "ar" ? "مرتجعات الموردين" : "Supplier returns"}</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="mt-4 space-y-6">
          <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{locale === "ar" ? "الفاتورة" : "Invoice"} *</Label>
              <Select value={invoiceId} onValueChange={(v) => { setInvoiceId(v); setReturnQtys({}); }}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {invoices.map((i) => (
                    <SelectItem key={i.id} value={i.id}>{i.invoiceNumber}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{locale === "ar" ? "صندوق الاسترداد" : "Refund cash account"}</Label>
              <Select value={cashAccountId} onValueChange={setCashAccountId}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {cashAccounts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {invoiceId && (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{locale === "ar" ? "الصنف" : "Item"}</TableHead>
                    <TableHead className="text-end">{locale === "ar" ? "السعر" : "Price"}</TableHead>
                    <TableHead className="text-end">{locale === "ar" ? "مباع" : "Sold"}</TableHead>
                    <TableHead className="text-end">{locale === "ar" ? "للإرجاع" : "Return qty"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">{locale === "ar" ? "لا توجد أصناف قابلة للإرجاع" : "No returnable items"}</TableCell>
                    </TableRow>
                  ) : (
                    selectedItems.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell className="font-medium">{i.name}</TableCell>
                        <TableCell className="text-end">{fmtMoney(BigInt(Math.round(i.unitPrice * 100)), locale)}</TableCell>
                        <TableCell className="text-end">{i.qty}</TableCell>
                        <TableCell className="text-end">
                          <Input className="ms-auto w-24" type="number" min={0} max={i.maxReturn} value={returnQtys[i.id] ?? 0}
                            onChange={(e) => setReturnQtys((m) => ({ ...m, [i.id]: Math.min(i.maxReturn, Number(e.target.value)) }))} />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="space-y-2">
            <Label>{locale === "ar" ? "السبب" : "Reason"}</Label>
            <Textarea value={returnReason} onChange={(e) => setReturnReason(e.target.value)} placeholder={locale === "ar" ? "سبب الإرجاع..." : "Return reason..."} />
            <div className="flex items-center justify-end gap-2">
              <span className="text-sm text-muted-foreground">{locale === "ar" ? "الإجمالي" : "Total"}: <strong>{fmtMoney(BigInt(Math.round(returnTotal() * 100)), locale)}</strong></span>
              <Button onClick={submitSales} disabled={pending}>{locale === "ar" ? "تسجيل المرتجع" : "Record return"}</Button>
            </div>
          </div>

          {salesReturns.length > 0 && (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{locale === "ar" ? "المرتجع" : "Return no"}</TableHead>
                    <TableHead>{locale === "ar" ? "الفاتورة" : "Invoice"}</TableHead>
                    <TableHead>{locale === "ar" ? "التاريخ" : "Date"}</TableHead>
                    <TableHead className="text-end">{locale === "ar" ? "المبلغ" : "Amount"}</TableHead>
                    <TableHead>{locale === "ar" ? "السبب" : "Reason"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salesReturns.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.returnNumber}</TableCell>
                      <TableCell>{r.invoiceNumber}</TableCell>
                      <TableCell>{new Date(r.createdAt).toLocaleString(locale === "ar" ? "ar-YE" : "en-GB")}</TableCell>
                      <TableCell className="text-end">{fmtMoney(BigInt(Math.round(r.total * 100)), locale)}</TableCell>
                      <TableCell className="text-muted-foreground">{r.reason}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="supplier" className="mt-4 space-y-6">
          <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
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
              <Label>{locale === "ar" ? "السبب" : "Reason"} *</Label>
              <Select value={supReason} onValueChange={setSupReason}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {[
                    ["expired", locale === "ar" ? "منتهي الصلاحية" : "Expired"],
                    ["damaged", locale === "ar" ? "تالف" : "Damaged"],
                    ["wrong_shipment", locale === "ar" ? "شحنة خاطئة" : "Wrong shipment"],
                    ["recall", locale === "ar" ? "استدعاء" : "Recall"],
                    ["other", locale === "ar" ? "أخرى" : "Other"],
                  ].map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{locale === "ar" ? "الأصناف المرتجعة" : "Returned items"} *</Label>
              <Button size="sm" variant="outline" onClick={addSupLine}><Plus /> {locale === "ar" ? "إضافة" : "Add"}</Button>
            </div>
            {supLines.map((line, idx) => {
              const b = batchFor(line.batchId);
              return (
                <div key={idx} className="grid grid-cols-12 items-center gap-2 rounded-md border p-2">
                  <div className="col-span-7">
                    <Select value={line.batchId} onValueChange={(v) => updateSupLine(idx, { batchId: v })}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        {batchOptions.map((bo) => (
                          <SelectItem key={bo.id} value={bo.id}>{bo.name} — {bo.batchNo}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Input className="col-span-3" type="number" min={1} max={b?.remaining ?? 999999} value={line.qty}
                    onChange={(e) => updateSupLine(idx, { qty: Number(e.target.value) })} />
                  <span className="col-span-1 text-xs text-muted-foreground">{b ? `/ ${b.remaining}` : ""}</span>
                  <Button className="col-span-1" size="iconSm" variant="ghost" onClick={() => setSupLines((l) => l.filter((_, i) => i !== idx))}>
                    <Trash2 className="text-destructive" />
                  </Button>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end">
            <Button onClick={submitSupplier} disabled={pending}>{locale === "ar" ? "تسجيل مرتجع المورد" : "Record supplier return"}</Button>
          </div>

          {supplierReturns.length > 0 && (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{locale === "ar" ? "المرتجع" : "Return no"}</TableHead>
                    <TableHead>{locale === "ar" ? "المورد" : "Supplier"}</TableHead>
                    <TableHead>{locale === "ar" ? "التاريخ" : "Date"}</TableHead>
                    <TableHead className="text-end">{locale === "ar" ? "المبلغ" : "Amount"}</TableHead>
                    <TableHead>{locale === "ar" ? "السبب" : "Reason"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {supplierReturns.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.returnNumber}</TableCell>
                      <TableCell>{r.supplier}</TableCell>
                      <TableCell>{new Date(r.createdAt).toLocaleString(locale === "ar" ? "ar-YE" : "en-GB")}</TableCell>
                      <TableCell className="text-end">{fmtMoney(BigInt(Math.round(r.total * 100)), locale)}</TableCell>
                      <TableCell className="text-muted-foreground">{r.reason}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
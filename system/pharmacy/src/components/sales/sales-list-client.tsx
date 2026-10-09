"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Eye, Printer, Search, XCircle } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { translateKey } from "@/lib/client-i18n";
import { fmtMoney } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cancelSale } from "@/lib/actions/sales";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Row = {
  id: string;
  invoiceNumber: string;
  customer: string;
  issuedAt: string;
  status: string;
  paymentMethod: string;
  total: number;
  paid: number;
  createdBy: string;
};

export function SalesListClient({ locale, rows }: { locale: Locale; rows: Row[] }) {
  const t = (k: string) => translateKey(locale, k);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"all" | "posted" | "voided">("all");
  const [pending, startTransition] = useTransition();
  const [voiding, setVoiding] = useState<Row | null>(null);
  const [reason, setReason] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (tab !== "all" && r.status !== tab) return false;
      if (q && !r.invoiceNumber.toLowerCase().includes(q) && !r.customer.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, tab, query]);

  const totals = useMemo(() => {
    const posted = rows.filter((r) => r.status === "posted");
    return { count: posted.length, sum: posted.reduce((s, r) => s + r.total, 0) };
  }, [rows]);

  function submitVoid() {
    if (!voiding) return;
    startTransition(async () => {
      try {
        await cancelSale(voiding.id, reason || "manual");
        toast.success(locale === "ar" ? "تم إلغاء الفاتورة" : "Invoice voided");
        setVoiding(null);
        setReason("");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("common.unpublished"));
      }
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={locale === "ar" ? "المبيعات" : "Sales"}
        description={locale === "ar" ? `سجل الفواتير — ${totals.count} فاتورة بقيمة ${fmtMoney(BigInt(Math.round(totals.sum * 100)), locale)}` : `${totals.count} invoices totaling ${fmtMoney(BigInt(Math.round(totals.sum * 100)), locale)}`}
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="all">{locale === "ar" ? "الكل" : "All"}</TabsTrigger>
            <TabsTrigger value="posted">{locale === "ar" ? "المعتمدة" : "Posted"}</TabsTrigger>
            <TabsTrigger value="voided">{locale === "ar" ? "الملغاة" : "Voided"}</TabsTrigger>
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
                  <TableHead>{locale === "ar" ? "الفاتورة" : "Invoice"}</TableHead>
                  <TableHead>{locale === "ar" ? "العميل" : "Customer"}</TableHead>
                  <TableHead>{locale === "ar" ? "التاريخ" : "Date"}</TableHead>
                  <TableHead>{locale === "ar" ? "الدفع" : "Payment"}</TableHead>
                  <TableHead className="text-end">{locale === "ar" ? "الإجمالي" : "Total"}</TableHead>
                  <TableHead>{locale === "ar" ? "الحالة" : "Status"}</TableHead>
                  <TableHead>{locale === "ar" ? "البائع" : "Cashier"}</TableHead>
                  <TableHead className="text-end">{locale === "ar" ? "إجراءات" : "Actions"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                      {locale === "ar" ? "لا توجد مبيعات" : "No sales"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.invoiceNumber}</TableCell>
                      <TableCell>{r.customer}</TableCell>
                      <TableCell>{new Date(r.issuedAt).toLocaleString(locale === "ar" ? "ar-YE" : "en-GB")}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{paymentLabel(r.paymentMethod, locale)}</Badge>
                      </TableCell>
                      <TableCell className="text-end font-medium">{fmtMoney(BigInt(Math.round(r.total * 100)), locale)}</TableCell>
                      <TableCell>
                        {r.status === "posted" ? (
                          <Badge variant="success">{locale === "ar" ? "معتمدة" : "Posted"}</Badge>
                        ) : (
                          <Badge variant="destructive">{locale === "ar" ? "ملغاة" : "Voided"}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{r.createdBy}</TableCell>
                      <TableCell className="text-end">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="iconSm" variant="ghost" onClick={() => window.open(`/print/receipt/${r.id}`, "_blank")} title={locale === "ar" ? "طباعة الإيصال" : "Print receipt"}>
                            <Printer />
                          </Button>
                          <Button size="iconSm" variant="ghost" title={locale === "ar" ? "استعراض" : "View"}><Eye /></Button>
                          {r.status === "posted" && (
                            <Button size="iconSm" variant="ghost" onClick={() => { setVoiding(r); setReason(""); }} title={locale === "ar" ? "إلغاء" : "Void"}>
                              <XCircle className="text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(voiding)} onOpenChange={(o) => !o && setVoiding(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{locale === "ar" ? `إلغاء الفاتورة ${voiding?.invoiceNumber}` : `Void invoice ${voiding?.invoiceNumber}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{locale === "ar" ? "سيتم إرجاع الأصناف للمخزون وإلغاء المدفوعات." : "Items will be returned to stock and payments voided."}</p>
            <Textarea placeholder={locale === "ar" ? "سبب الإلغاء" : "Reason"} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoiding(null)}>{t("common.cancel")}</Button>
            <Button variant="destructive" onClick={submitVoid} disabled={pending}>{locale === "ar" ? "تأكيد الإلغاء" : "Confirm void"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function paymentLabel(method: string, locale: Locale) {
  const map: Record<string, [string, string]> = {
    cash: ["نقدي", "Cash"],
    credit: ["آجل", "Credit"],
    mixed: ["مختلط", "Mixed"],
  };
  const [ar, en] = map[method] ?? [method, method];
  return locale === "ar" ? ar : en;
}
"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { translateKey } from "@/lib/client-i18n";
import { fmtMoney, fmtNumber } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Row = {
  id: string;
  name: string;
  batchNo: string;
  expiry: string;
  daysLeft: number;
  initial: number;
  remaining: number;
  purchasePrice: number;
  status: "active" | "expiring" | "expired" | "empty";
};

const TABS = [
  { key: "all", ar: "الكل", en: "All" },
  { key: "active", ar: "سارية", en: "Active" },
  { key: "expiring", ar: "قريبة الانتهاء", en: "Expiring" },
  { key: "expired", ar: "منتهية", en: "Expired" },
  { key: "empty", ar: "مستهلكة", en: "Empty" },
] as const;

export function BatchesClient({ locale, rows }: { locale: Locale; rows: Row[] }) {
  const t = (k: string) => translateKey(locale, k);
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (tab !== "all" && r.status !== tab) return false;
      if (q && !r.name.toLowerCase().includes(q) && !r.batchNo.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, tab, query]);

  const badgeFor = (r: Row) => {
    switch (r.status) {
      case "expiring":
        return <Badge variant="warning">{locale === "ar" ? `تنتهي خلال ${r.daysLeft} يوم` : `Expires in ${r.daysLeft}d`}</Badge>;
      case "expired":
        return <Badge variant="destructive">{locale === "ar" ? "منتهية" : "Expired"}</Badge>;
      case "empty":
        return <Badge variant="secondary">{locale === "ar" ? "مستهلكة" : "Empty"}</Badge>;
      default:
        return <Badge variant="success">{locale === "ar" ? "سارية" : "Active"}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={locale === "ar" ? "الدفعات" : "Batches"}
        description={locale === "ar" ? "متابعة الدفعات وتواريخ الانتهاء (FEFO)" : "Track batches and expiry dates (FEFO)"}
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as (typeof TABS)[number]["key"])}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            {TABS.map((x) => (
              <TabsTrigger key={x.key} value={x.key}>{locale === "ar" ? x.ar : x.en}</TabsTrigger>
            ))}
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
                  <TableHead>{locale === "ar" ? "الصنف" : "Item"}</TableHead>
                  <TableHead>{locale === "ar" ? "رقم الدفعة" : "Batch no"}</TableHead>
                  <TableHead>{locale === "ar" ? "تاريخ الانتهاء" : "Expiry"}</TableHead>
                  <TableHead className="text-end">{locale === "ar" ? "الكمية المحصلة" : "Received"}</TableHead>
                  <TableHead className="text-end">{locale === "ar" ? "المتبقي" : "Remaining"}</TableHead>
                  <TableHead className="text-end">{locale === "ar" ? "سعر الشراء" : "Cost"}</TableHead>
                  <TableHead>{locale === "ar" ? "الحالة" : "Status"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      {locale === "ar" ? "لا توجد دفعات" : "No batches"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="font-mono text-sm">{r.batchNo}</TableCell>
                      <TableCell>{new Date(r.expiry).toLocaleDateString(locale === "ar" ? "ar-YE" : "en-GB")}</TableCell>
                      <TableCell className="text-end text-muted-foreground">{fmtNumber(r.initial)}</TableCell>
                      <TableCell className="text-end font-medium">{r.remaining > 0 ? fmtNumber(r.remaining) : <span className="text-muted-foreground">0</span>}</TableCell>
                      <TableCell className="text-end text-muted-foreground">{fmtMoney(BigInt(Math.round(r.purchasePrice * 100)), locale)}</TableCell>
                      <TableCell>{badgeFor(r)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
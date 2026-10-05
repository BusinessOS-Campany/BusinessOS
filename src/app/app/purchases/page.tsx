"use client";

import React, { useState, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Purchase {
  id: string;
  number: string;
  supplierId: string;
  total: number;
  paidTotal: number;
  status: string;
  issuedAt: string;
}

export default function PurchasesPage() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/v1/purchases");
        const json = await res.json();
        const data = json.data;
        setPurchases(data.purchases ?? []);
      } catch {
        setError("فشل تحميل بيانات المشتريات");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function getStatus(purchase: Purchase) {
    if (purchase.status === "paid" || purchase.total - purchase.paidTotal <= 0)
      return { label: "مدفوعة", variant: "success" as const };
    if (purchase.paidTotal > 0)
      return { label: "جزئية", variant: "warning" as const };
    return { label: "غير مدفوعة", variant: "destructive" as const };
  }

  function formatMoney(amount: number) {
    return (amount / 100).toLocaleString("ar-SA") + " ر.س";
  }

  return (
    <div dir="rtl" className="min-h-screen bg-background p-6">
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-foreground">
            المشتريات / Purchases
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : error ? (
            <div className="py-12 text-center text-red-400">{error}</div>
          ) : purchases.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              لا توجد مشتريات حالياً
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="text-right text-muted-foreground">
                    مشتريات #
                  </TableHead>
                  <TableHead className="text-right text-muted-foreground">
                    التاريخ
                  </TableHead>
                  <TableHead className="text-right text-muted-foreground">
                    المبلغ (ر.س)
                  </TableHead>
                  <TableHead className="text-right text-muted-foreground">
                    المدفوع (ر.س)
                  </TableHead>
                  <TableHead className="text-right text-muted-foreground">
                    المتبقي (ر.س)
                  </TableHead>
                  <TableHead className="text-right text-muted-foreground">
                    الحالة
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchases.map((p) => {
                  const status = getStatus(p);
                  return (
                    <TableRow key={p.id} className="border-border">
                      <TableCell className="font-medium text-foreground">
                        {p.number}
                      </TableCell>
                      <TableCell className="text-card-foreground">
                        {new Date(p.issuedAt).toLocaleDateString("ar-SA")}
                      </TableCell>
                      <TableCell className="text-card-foreground">
                        {formatMoney(p.total)}
                      </TableCell>
                      <TableCell className="text-card-foreground">
                        {formatMoney(p.paidTotal)}
                      </TableCell>
                      <TableCell className="text-card-foreground">
                        {formatMoney(p.total - p.paidTotal)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

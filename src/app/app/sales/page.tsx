"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
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
import { Plus } from "lucide-react";

interface Invoice {
  id: string;
  number: string;
  customerId: string;
  total: number;
  paidTotal: number;
  issuedAt: string;
}

export default function SalesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/v1/sales");
        const json = await res.json();
        const data = json.data;
        setInvoices(data.invoices ?? []);
      } catch {
        setError("فشل تحميل بيانات المبيعات");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function getStatus(invoice: Invoice) {
    const balance = invoice.total - invoice.paidTotal;
    if (balance <= 0) return { label: "مدفوعة", variant: "success" as const };
    if (invoice.paidTotal > 0) return { label: "جزئية", variant: "warning" as const };
    return { label: "غير مدفوعة", variant: "destructive" as const };
  }

  function formatMoney(amount: number) {
    return (amount / 100).toLocaleString("ar-SA") + " ر.س";
  }

  return (
    <div dir="rtl" className="min-h-screen bg-background p-6">
      <Card className="border-border bg-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-xl font-bold text-foreground">
            المبيعات / Sales
          </CardTitle>
          <Button>
            <Plus className="ml-2 h-4 w-4" />
            إضافة فاتورة / New Invoice
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : error ? (
            <div className="py-12 text-center text-red-400">{error}</div>
          ) : invoices.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              لا توجد فواتير مبيعات حالياً
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="text-right text-muted-foreground">
                    فاتورة #
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
                {invoices.map((inv) => {
                  const status = getStatus(inv);
                  return (
                    <TableRow key={inv.id} className="border-border">
                      <TableCell className="font-medium text-foreground">
                        {inv.number}
                      </TableCell>
                      <TableCell className="text-card-foreground">
                        {new Date(inv.issuedAt).toLocaleDateString("ar-SA")}
                      </TableCell>
                      <TableCell className="text-card-foreground">
                        {formatMoney(inv.total)}
                      </TableCell>
                      <TableCell className="text-card-foreground">
                        {formatMoney(inv.paidTotal)}
                      </TableCell>
                      <TableCell className="text-card-foreground">
                        {formatMoney(inv.total - inv.paidTotal)}
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

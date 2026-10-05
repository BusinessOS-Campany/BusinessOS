"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus } from "lucide-react";

interface Expense {
  id: string;
  categoryId: string;
  amount: number;
  cashAccountId: string;
  note: string;
  spentAt: string;
}

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [formAmount, setFormAmount] = useState("");
  const [formNote, setFormNote] = useState("");

  useEffect(() => {
    loadExpenses();
  }, []);

  async function loadExpenses() {
    try {
      setLoading(true);
      const res = await fetch("/api/v1/expenses");
      const json = await res.json();
      const data = json.data;
      setExpenses(data.expenses ?? []);
    } catch {
      setError("فشل تحميل بيانات المصروفات");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit() {
    const amountSar = parseFloat(formAmount);
    if (isNaN(amountSar) || amountSar <= 0) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Math.round(amountSar * 100),
          note: formNote || undefined,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setDialogOpen(false);
        setFormAmount("");
        setFormNote("");
        await loadExpenses();
      }
    } catch {
      setError("فشل إضافة المصروف");
    } finally {
      setSubmitting(false);
    }
  }

  function formatMoney(amount: number) {
    return (amount / 100).toLocaleString("ar-SA") + " ر.س";
  }

  return (
    <div dir="rtl" className="min-h-screen bg-background p-6">
      <Card className="border-border bg-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-xl font-bold text-foreground">
            المصروفات / Expenses
          </CardTitle>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="ml-2 h-4 w-4" />
                إضافة مصروف / Add Expense
              </Button>
            </DialogTrigger>
            <DialogContent className="border-border bg-card">
              <DialogHeader>
                <DialogTitle className="text-foreground">
                  إضافة مصروف جديد
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="amount">المبلغ (ر.س)</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="note">ملاحظة</Label>
                  <Input
                    id="note"
                    placeholder="optional"
                    value={formNote}
                    onChange={(e) => setFormNote(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  disabled={submitting}
                >
                  إلغاء
                </Button>
                <Button onClick={handleSubmit} disabled={submitting || !formAmount}>
                  {submitting ? "جاري الإضافة..." : "إضافة"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : error ? (
            <div className="py-12 text-center text-red-400">{error}</div>
          ) : expenses.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              لا توجد مصروفات حالياً
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="text-right text-muted-foreground">
                    التاريخ
                  </TableHead>
                  <TableHead className="text-right text-muted-foreground">
                    الفئة
                  </TableHead>
                  <TableHead className="text-right text-muted-foreground">
                    المبلغ (ر.س)
                  </TableHead>
                  <TableHead className="text-right text-muted-foreground">
                    ملاحظة
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((exp) => (
                  <TableRow key={exp.id} className="border-border">
                    <TableCell className="text-card-foreground">
                      {new Date(exp.spentAt).toLocaleDateString("ar-SA")}
                    </TableCell>
                    <TableCell className="text-card-foreground">
                      {exp.categoryId || "—"}
                    </TableCell>
                    <TableCell className="text-card-foreground">
                      {formatMoney(exp.amount)}
                    </TableCell>
                    <TableCell className="text-card-foreground">
                      {exp.note || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

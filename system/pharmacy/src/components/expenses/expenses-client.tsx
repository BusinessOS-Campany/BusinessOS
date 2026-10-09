"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Search, Tag, Trash2 } from "lucide-react";
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
import { createExpense, saveExpenseCategory, deleteExpense, deleteExpenseCategory } from "@/lib/actions/expenses";

type Row = {
  id: string;
  category: string;
  description: string;
  amount: number;
  method: string;
  paidAt: string;
};

export function ExpensesClient({
  locale,
  rows,
  categories,
  cashAccounts,
}: {
  locale: Locale;
  rows: Row[];
  categories: Array<{ id: string; name: string }>;
  cashAccounts: Array<{ id: string; name: string }>;
}) {
  const t = (k: string) => translateKey(locale, k);
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState("cash");
  const [cashAccountId, setCashAccountId] = useState("");
  const [catOpen, setCatOpen] = useState(false);
  const [catNames, setCatNames] = useState<Record<string, string>>({});

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.description.toLowerCase().includes(q) || r.category.toLowerCase().includes(q));
  }, [rows, query]);

  const total = rows.reduce((s, r) => s + r.amount, 0);

  useEffect(() => {
    if (catOpen) {
      const init: Record<string, string> = {};
      for (const c of categories) init[c.id] = c.name;
      setCatNames(init);
    }
  }, [catOpen, categories]);

  function submit() {
    if (!description || amount <= 0) {
      toast.error(locale === "ar" ? "أكمل بيانات المصروف" : "Complete the expense");
      return;
    }
    startTransition(async () => {
      try {
        await createExpense({ categoryId: categoryId || null, description, amount, method, cashAccountId: cashAccountId || null, paidAt: null });
        toast.success(locale === "ar" ? "تم تسجيل المصروف" : "Expense recorded");
        setOpen(false);
        setCategoryId("");
        setDescription("");
        setAmount(0);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("common.unpublished"));
      }
    });
  }

  function submitCategories() {
    startTransition(async () => {
      for (const c of categories) {
        const name = catNames[c.id];
        if (name && name !== c.name) await saveExpenseCategory({ id: c.id, nameAr: name });
      }
      const newName = catNames["__new"]?.trim();
      if (newName) await saveExpenseCategory({ nameAr: newName });
      toast.success(t("common.saved"));
      setCatOpen(false);
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={locale === "ar" ? "المصروفات" : "Expenses"}
        description={locale === "ar" ? `إجمالي المصروفات: ${fmtMoney(BigInt(Math.round(total * 100)), locale)}` : `Total: ${fmtMoney(BigInt(Math.round(total * 100)), locale)}`}
        actions={
          <>
            <Button variant="outline" onClick={() => setCatOpen(true)}><Tag /> {locale === "ar" ? "التصنيفات" : "Categories"}</Button>
            <Button onClick={() => setOpen(true)}><Plus /> {locale === "ar" ? "مصروف جديد" : "New expense"}</Button>
          </>
        }
      />

      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">{locale === "ar" ? "السجل" : "Records"}</TabsTrigger>
          <TabsTrigger value="bycat">{locale === "ar" ? "حسب التصنيف" : "By category"}</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-4 space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="ps-9" placeholder={t("common.searchPlaceholder")} value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{locale === "ar" ? "التصنيف" : "Category"}</TableHead>
                  <TableHead>{locale === "ar" ? "البيان" : "Description"}</TableHead>
                  <TableHead>{locale === "ar" ? "التاريخ" : "Date"}</TableHead>
                  <TableHead>{locale === "ar" ? "الدفع" : "Method"}</TableHead>
                  <TableHead className="text-end">{locale === "ar" ? "المبلغ" : "Amount"}</TableHead>
                  <TableHead className="text-end">{locale === "ar" ? "إجراءات" : "Actions"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell><Badge variant="secondary">{r.category}</Badge></TableCell>
                    <TableCell>{r.description}</TableCell>
                    <TableCell>{new Date(r.paidAt).toLocaleDateString(locale === "ar" ? "ar-YE" : "en-GB")}</TableCell>
                    <TableCell>{r.method}</TableCell>
                    <TableCell className="text-end font-medium">{fmtMoney(BigInt(Math.round(r.amount * 100)), locale)}</TableCell>
                    <TableCell className="text-end">
                      <Button size="iconSm" variant="ghost" onClick={() => startTransition(async () => { await deleteExpense(r.id); })}><Trash2 className="text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="bycat" className="mt-4">
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{locale === "ar" ? "التصنيف" : "Category"}</TableHead>
                  <TableHead className="text-end">{locale === "ar" ? "العدد" : "Count"}</TableHead>
                  <TableHead className="text-end">{locale === "ar" ? "الإجمالي" : "Total"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((c) => {
                  const items = rows.filter((r) => r.category === c.name);
                  if (items.length === 0) return null;
                  return (
                    <TableRow key={c.id}>
                      <TableCell>{c.name}</TableCell>
                      <TableCell className="text-end">{items.length}</TableCell>
                      <TableCell className="text-end font-medium">{fmtMoney(BigInt(Math.round(items.reduce((s, r) => s + r.amount, 0) * 100)), locale)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{locale === "ar" ? "مصروف جديد" : "New expense"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{locale === "ar" ? "التصنيف" : "Category"}</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{locale === "ar" ? "المبلغ (ريال)" : "Amount (YER)"} *</Label>
              <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>{locale === "ar" ? "البيان" : "Description"} *</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{locale === "ar" ? "طريقة الدفع" : "Method"}</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{locale === "ar" ? "نقدي" : "Cash"}</SelectItem>
                  <SelectItem value="bank">{locale === "ar" ? "بنكي" : "Bank"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{locale === "ar" ? "الصندوق" : "Cash account"}</Label>
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={submit} disabled={pending}>{t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={catOpen} onOpenChange={setCatOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{locale === "ar" ? "تصنيفات المصروفات" : "Expense categories"}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {categories.map((c) => (
              <div key={c.id} className="flex items-center gap-2">
                <Input value={catNames[c.id] ?? c.name} onChange={(e) => setCatNames((m) => ({ ...m, [c.id]: e.target.value }))} />
                <Button size="iconSm" variant="ghost" onClick={() => startTransition(async () => { await deleteExpenseCategory(c.id); })}><Trash2 className="text-destructive" /></Button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <Input placeholder={locale === "ar" ? "تصنيف جديد..." : "New category..."} value={catNames["__new"] ?? ""} onChange={(e) => setCatNames((m) => ({ ...m, __new: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={submitCategories} disabled={pending}>{t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowUpFromLine, ArrowDownToLine, Wallet } from "lucide-react";
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
import { openCashSession, closeCashSession, depositCash, withdrawCash } from "@/lib/actions/cash";

type Account = { id: string; name: string; type: string; isActive: boolean };
type Session = { id: string; cashAccountId: string; status: string; openingBalance: number; closingBalance: number | null; actualBalance: number | null; discrepancy: number | null; openedAt: string };
type Movement = { id: string; cashAccountId: string; delta: number; reason: string; note: string; createdAt: string };

const REASON_LABEL: Record<string, [string, string]> = {
  opening: ["رصيد افتتاحي", "Opening"],
  closing: ["إغلاق", "Closing"],
  sale_payment: ["مبيعات", "Sales"],
  sale_refund: ["استرداد", "Refund"],
  purchase_payment: ["مشتريات", "Purchases"],
  expense: ["مصروف", "Expense"],
  deposit: ["إيداع", "Deposit"],
  withdrawal: ["سحب", "Withdrawal"],
};

export function CashClient({ locale, accounts, sessions, movements }: {
  locale: Locale;
  accounts: Account[];
  sessions: Session[];
  movements: Movement[];
}) {
  const t = (k: string) => translateKey(locale, k);
  const [pending, startTransition] = useTransition();
  const [accountFilter, setAccountFilter] = useState("all");
  const [openFor, setOpenFor] = useState<Account | null>(null);
  const [openingBal, setOpeningBal] = useState(0);
  const [closeFor, setCloseFor] = useState<Session | null>(null);
  const [actualBal, setActualBal] = useState(0);
  const [moveFor, setMoveFor] = useState<Account | null>(null);
  const [moveDir, setMoveDir] = useState<"deposit" | "withdraw">("deposit");
  const [moveAmt, setMoveAmt] = useState(0);
  const [moveNote, setMoveNote] = useState("");

  const balances = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of accounts) map.set(a.id, 0);
    for (const m of movements) map.set(m.cashAccountId, (map.get(m.cashAccountId) ?? 0) + m.delta);
    return map;
  }, [accounts, movements]);

  const filteredMovements = useMemo(
    () => (accountFilter === "all" ? movements : movements.filter((m) => m.cashAccountId === accountFilter)),
    [movements, accountFilter]
  );

  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? "—";
  const openSessions = sessions.filter((s) => s.status === "open");

  function doOpen() {
    if (!openFor) return;
    startTransition(async () => {
      try {
        await openCashSession(openFor.id, openingBal);
        toast.success(locale === "ar" ? "تم فتح الجلسة" : "Session opened");
        setOpenFor(null);
        setOpeningBal(0);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("common.unpublished"));
      }
    });
  }
  function doClose() {
    if (!closeFor) return;
    startTransition(async () => {
      try {
        await closeCashSession(closeFor.id, actualBal);
        toast.success(locale === "ar" ? "تم الإغلاق" : "Session closed");
        setCloseFor(null);
        setActualBal(0);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("common.unpublished"));
      }
    });
  }
  function doMove() {
    if (!moveFor || moveAmt <= 0) return;
    startTransition(async () => {
      try {
        if (moveDir === "deposit") await depositCash({ cashAccountId: moveFor.id, amount: moveAmt, note: moveNote || null });
        else await withdrawCash({ cashAccountId: moveFor.id, amount: moveAmt, note: moveNote || null });
        toast.success(locale === "ar" ? "تمت العملية" : "Done");
        setMoveFor(null);
        setMoveAmt(0);
        setMoveNote("");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("common.unpublished"));
      }
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={locale === "ar" ? "إدارة الصندوق" : "Cash management"}
        description={locale === "ar" ? "الجلسات النقدية والإيداعات والسحوبات" : "Cash sessions, deposits and withdrawals"}
        actions={
          <Button onClick={() => { setMoveFor(accounts[0] ?? null); setMoveDir("deposit"); setMoveAmt(0); }}>
            <Wallet /> {locale === "ar" ? "عملية صندوق" : "Cash operation"}
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map((a) => (
          <div key={a.id} className="rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{a.name}</span>
              <Badge variant={a.isActive ? "success" : "secondary"}>{a.isActive ? (locale === "ar" ? "نشط" : "Active") : (locale === "ar" ? "موقوف" : "Inactive")}</Badge>
            </div>
            <p className="mt-2 text-2xl font-bold">{fmtMoney(BigInt(Math.round((balances.get(a.id) ?? 0) * 100)), locale)}</p>
            <div className="mt-3 flex gap-2">
              {openSessions.some((s) => s.cashAccountId === a.id) ? (
                <Button size="sm" variant="destructive" onClick={() => setCloseFor(openSessions.find((s) => s.cashAccountId === a.id)!)}>
                  {locale === "ar" ? "إغلاق الجلسة" : "Close session"}
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => { setOpenFor(a); setOpeningBal(0); }}>{locale === "ar" ? "فتح جلسة" : "Open session"}</Button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{locale === "ar" ? "الحركة" : "Movement"}</TableHead>
              <TableHead>{locale === "ar" ? "الصندوق" : "Account"}</TableHead>
              <TableHead>{locale === "ar" ? "التاريخ" : "Date"}</TableHead>
              <TableHead className="text-end">{locale === "ar" ? "المبلغ" : "Amount"}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredMovements.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="py-10 text-center text-muted-foreground">{locale === "ar" ? "لا توجد حركات" : "No movements"}</TableCell></TableRow>
            ) : (
              filteredMovements.map((m) => {
                const [ar, en] = REASON_LABEL[m.reason] ?? [m.reason, m.reason];
                return (
                  <TableRow key={m.id}>
                    <TableCell>
                      <div className="font-medium">{locale === "ar" ? ar : en}</div>
                      <div className="text-xs text-muted-foreground">{m.note}</div>
                    </TableCell>
                    <TableCell>{accountName(m.cashAccountId)}</TableCell>
                    <TableCell>{new Date(m.createdAt).toLocaleString(locale === "ar" ? "ar-YE" : "en-GB")}</TableCell>
                    <TableCell className={`text-end font-medium ${m.delta >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                      {m.delta >= 0 ? "+" : ""}{fmtMoney(BigInt(Math.round(m.delta * 100)), locale)}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={Boolean(openFor)} onOpenChange={(o) => !o && setOpenFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{locale === "ar" ? "فتح جلسة نقدية" : "Open cash session"}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>{locale === "ar" ? "رصيد الافتتاح" : "Opening balance"}</Label>
            <Input type="number" step="0.01" value={openingBal} onChange={(e) => setOpeningBal(Number(e.target.value))} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenFor(null)}>{t("common.cancel")}</Button>
            <Button onClick={doOpen} disabled={pending}>{locale === "ar" ? "فتح" : "Open"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(closeFor)} onOpenChange={(o) => !o && setCloseFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{locale === "ar" ? "إغلاق الجلسة" : "Close session"}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{locale === "ar" ? "الرصيد المتوقع من النظام: " : "Expected balance: "}{closeFor ? fmtMoney(BigInt(Math.round((expectedFor(closeFor, movements) ) * 100)), locale) : "—"}</p>
          <div className="space-y-2">
            <Label>{locale === "ar" ? "الرصيد الفعلي" : "Actual counted balance"}</Label>
            <Input type="number" step="0.01" value={actualBal} onChange={(e) => setActualBal(Number(e.target.value))} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseFor(null)}>{t("common.cancel")}</Button>
            <Button variant="destructive" onClick={doClose} disabled={pending}>{locale === "ar" ? "إغلاق وحساب الفرق" : "Close & reconcile"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(moveFor)} onOpenChange={(o) => !o && setMoveFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{locale === "ar" ? "عملية صندوق" : "Cash operation"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{locale === "ar" ? "النوع" : "Type"}</Label>
              <Select value={moveDir} onValueChange={(v) => setMoveDir(v as typeof moveDir)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="deposit">{locale === "ar" ? "إيداع" : "Deposit"}</SelectItem>
                  <SelectItem value="withdraw">{locale === "ar" ? "سحب" : "Withdraw"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{locale === "ar" ? "الصندوق" : "Account"}</Label>
              <Select value={moveFor?.id ?? ""} onValueChange={(v) => setMoveFor(accounts.find((a) => a.id === v) ?? null)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (<SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{locale === "ar" ? "المبلغ" : "Amount"}</Label>
              <Input type="number" min={0} step="0.01" value={moveAmt} onChange={(e) => setMoveAmt(Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label>{locale === "ar" ? "بيان" : "Note"}</Label>
              <Input value={moveNote} onChange={(e) => setMoveNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveFor(null)}>{t("common.cancel")}</Button>
            <Button onClick={doMove} disabled={pending}>
              {moveDir === "deposit" ? <ArrowUpFromLine /> : <ArrowDownToLine />} {locale === "ar" ? "تنفيذ" : "Execute"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function expectedFor(s: Session, movements: Movement[]) {
  const sum = movements.filter((m) => m.cashAccountId === s.cashAccountId).reduce((a, m) => a + m.delta, 0);
  return sum;
}
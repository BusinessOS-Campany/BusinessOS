"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Barcode, Minus, Pause, Play, Plus, Search, ShoppingCart, Trash2, X } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { translateKey } from "@/lib/client-i18n";
import { fmtMoney } from "@/lib/format";
import { checkout, holdCart, deleteHold } from "@/lib/actions/sales";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Med = {
  id: string;
  nameAr: string;
  nameEn: string | null;
  barcode: string | null;
  sku: string | null;
  salePrice: number;
  unit: string;
  strength: string | null;
  requiresPrescription: boolean;
  categoryId: string | null;
  stock: number;
};

type CartLine = {
  medicineId: string;
  nameAr: string;
  qty: number;
  unitPrice: number;
  discount: number;
  stock: number;
  requiresPrescription: boolean;
};

type Hold = {
  id: string;
  label: string | null;
  customerId: string | null;
  cart: unknown;
  createdAt: string;
};

export function PosClient({
  locale,
  warehouseId,
  cashAccounts,
  taxRateBps,
  medicines,
  categories,
  customers,
  holds,
}: {
  locale: Locale;
  warehouseId: string | null;
  cashAccounts: Array<{ id: string; nameAr: string }>;
  taxRateBps: number;
  medicines: Med[];
  categories: Array<{ id: string; nameAr: string }>;
  customers: Array<{ id: string; name: string; phone: string | null }>;
  holds: Hold[];
}) {
  const t = (k: string) => translateKey(locale, k);
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [discountTotal, setDiscountTotal] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "credit" | "mixed">("cash");
  const [paidAmount, setPaidAmount] = useState(0);
  const [cashAccountId, setCashAccountId] = useState(cashAccounts[0]?.id ?? "");
  const [pending, startTransition] = useTransition();
  const [receipt, setReceipt] = useState<{ id: string; invoiceNumber: string; total: number } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return medicines
      .filter((m) => categoryId === "all" || m.categoryId === categoryId)
      .filter(
        (m) =>
          !q ||
          m.nameAr.toLowerCase().includes(q) ||
          (m.nameEn ?? "").toLowerCase().includes(q) ||
          (m.barcode ?? "").includes(q) ||
          (m.sku ?? "").toLowerCase().includes(q)
      )
      .slice(0, 60);
  }, [medicines, query, categoryId]);

  const subtotal = cart.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const lineDiscounts = cart.reduce((s, l) => s + l.discount, 0);
  const taxTotal = ((subtotal - lineDiscounts - discountTotal) * taxRateBps) / 10000;
  const total = Math.max(0, subtotal - lineDiscounts - discountTotal + taxTotal);

  function addToCart(m: Med) {
    if (m.stock <= 0) {
      toast.error(locale === "ar" ? "نفدت الكمية" : "Out of stock");
      return;
    }
    setCart((prev) => {
      const existing = prev.find((l) => l.medicineId === m.id);
      if (existing) {
        if (existing.qty + 1 > m.stock) {
          toast.error(locale === "ar" ? "الكمية المتاحة غير كافية" : "Not enough stock");
          return prev;
        }
        return prev.map((l) => (l.medicineId === m.id ? { ...l, qty: l.qty + 1 } : l));
      }
      return [
        ...prev,
        {
          medicineId: m.id,
          nameAr: m.nameAr,
          qty: 1,
          unitPrice: m.salePrice,
          discount: 0,
          stock: m.stock,
          requiresPrescription: m.requiresPrescription,
        },
      ];
    });
    setQuery("");
    searchRef.current?.focus();
  }

  function handleSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const q = query.trim().toLowerCase();
    if (!q) return;
    const exact = medicines.find((m) => m.barcode === q || (m.sku ?? "").toLowerCase() === q);
    const target = exact ?? filtered[0];
    if (target) addToCart(target);
  }

  function updateLine(medicineId: string, patch: Partial<CartLine>) {
    setCart((prev) => prev.map((l) => (l.medicineId === medicineId ? { ...l, ...patch } : l)));
  }
  function removeLine(medicineId: string) {
    setCart((prev) => prev.filter((l) => l.medicineId !== medicineId));
  }

  function doCheckout() {
    if (cart.length === 0) return;
    if (!warehouseId) {
      toast.error(locale === "ar" ? "لا يوجد مخزن معرّف" : "No warehouse configured");
      return;
    }
    const rx = cart.some((l) => l.requiresPrescription);
    startTransition(async () => {
      const res = await checkout({
        customerId: customerId || null,
        warehouseId,
        cashAccountId: paymentMethod === "credit" ? null : cashAccountId || null,
        items: cart.map((l) => ({
          medicineId: l.medicineId,
          qty: l.qty,
          unitPrice: l.unitPrice,
          discount: l.discount,
        })),
        discountTotal,
        paymentMethod,
        paidAmount: paymentMethod === "credit" ? 0 : paymentMethod === "cash" ? total : paidAmount,
        notes: rx ? "Rx" : null,
      });
      if (!res.ok) {
        if (res.error?.startsWith("INSUFFICIENT_STOCK")) {
          const parts = res.error.split(":");
          toast.error(
            locale === "ar"
              ? `الكمية غير كافية: ${parts[1]} (متاح ${parts[2]})`
              : `Insufficient stock: ${parts[1]} (${parts[2]} available)`
          );
        } else {
          toast.error(t("common.unpublished"));
        }
        return;
      }
      toast.success(`${res.invoiceNumber} — ${t("common.saved")}`);
      setReceipt({ id: res.id!, invoiceNumber: res.invoiceNumber!, total: res.total! });
      setCart([]);
      setDiscountTotal(0);
      setPaidAmount(0);
      setCustomerId("");
      router.refresh();
    });
  }

  function doHold() {
    if (cart.length === 0) return;
    startTransition(async () => {
      await holdCart({ customerId: customerId || null, warehouseId, cart });
      toast.success(locale === "ar" ? "تم تعليق السلة" : "Cart held");
      setCart([]);
      router.refresh();
    });
  }

  function resumeHold(h: Hold) {
    try {
      const parsed = h.cart as CartLine[];
      setCart(Array.isArray(parsed) ? parsed : []);
      setCustomerId(h.customerId ?? "");
      startTransition(async () => {
        await deleteHold(h.id);
        router.refresh();
      });
    } catch {
      toast.error(t("common.unpublished"));
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
      {/* Catalog */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Barcode className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              autoFocus
              className="ps-9"
              placeholder={locale === "ar" ? "امسح الباركود أو ابحث..." : "Scan barcode or search..."}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleSearchKey}
            />
          </div>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{locale === "ar" ? "كل الفئات" : "All categories"}</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.nameAr}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {filtered.map((m) => (
            <button
              key={m.id}
              onClick={() => addToCart(m)}
              disabled={m.stock <= 0}
              className={cn(
                "flex flex-col items-start gap-1 rounded-lg border bg-card p-3 text-start shadow-sm transition-colors hover:border-primary hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              <span className="line-clamp-2 text-sm font-medium">{m.nameAr}</span>
              <span className="text-xs text-muted-foreground">{m.strength}</span>
              <div className="mt-1 flex w-full items-center justify-between">
                <span className="text-sm font-bold text-primary">{fmtMoney(BigInt(Math.round(m.salePrice * 100)), locale)}</span>
                <Badge variant={m.stock <= 0 ? "destructive" : m.stock <= 10 ? "warning" : "secondary"}>
                  {m.stock}
                </Badge>
              </div>
            </button>
          ))}
          {filtered.length === 0 ? (
            <p className="col-span-full py-10 text-center text-sm text-muted-foreground">{t("common.noResults")}</p>
          ) : null}
        </div>
      </div>

      {/* Cart */}
      <div className="space-y-3">
        {holds.length > 0 ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{locale === "ar" ? "سلال معلّقة" : "Held carts"}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {holds.map((h) => (
                <Button key={h.id} variant="outline" size="sm" onClick={() => resumeHold(h)}>
                  <Play /> {h.label ?? new Date(h.createdAt).toLocaleDateString("en-GB")}
                </Button>
              ))}
            </CardContent>
          </Card>
        ) : null}

        <Card className="sticky top-20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShoppingCart className="h-4 w-4" />
              {locale === "ar" ? "السلة" : "Cart"}
              <Badge variant="secondary" className="ms-auto">{cart.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select value={customerId || "walkin"} onValueChange={(v) => setCustomerId(v === "walkin" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder={locale === "ar" ? "عميل نقدي" : "Walk-in"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="walkin">{locale === "ar" ? "عميل نقدي" : "Walk-in customer"}</SelectItem>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}{c.phone ? ` — ${c.phone}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="max-h-[38vh] space-y-2 overflow-y-auto">
              {cart.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {locale === "ar" ? "السلة فارغة" : "Cart is empty"}
                </p>
              ) : (
                cart.map((l) => (
                  <div key={l.medicineId} className="rounded-lg border p-2">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium">{l.nameAr}</span>
                      <Button variant="ghost" size="iconSm" onClick={() => removeLine(l.medicineId)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        <Button variant="outline" size="iconSm" onClick={() => updateLine(l.medicineId, { qty: Math.max(1, l.qty - 1) })}>
                          <Minus className="h-3 w-3" />
                        </Button>
                        <Input
                          className="h-8 w-14 text-center"
                          type="number"
                          value={l.qty}
                          onChange={(e) => updateLine(l.medicineId, { qty: Math.min(l.stock, Math.max(1, Number(e.target.value))) })}
                        />
                        <Button variant="outline" size="iconSm" onClick={() => updateLine(l.medicineId, { qty: Math.min(l.stock, l.qty + 1) })}>
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      <Input
                        className="h-8 w-24 text-end"
                        type="number"
                        step="0.01"
                        value={l.unitPrice}
                        onChange={(e) => updateLine(l.medicineId, { unitPrice: Number(e.target.value) })}
                      />
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{locale === "ar" ? "خصم" : "Discount"}</span>
                      <Input
                        className="h-7 w-24 text-end"
                        type="number"
                        step="0.01"
                        value={l.discount}
                        onChange={(e) => updateLine(l.medicineId, { discount: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="space-y-1 border-t pt-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{locale === "ar" ? "المجموع" : "Subtotal"}</span>
                <span>{fmtMoney(BigInt(Math.round(subtotal * 100)), locale)}</span>
              </div>
              {taxRateBps > 0 ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{locale === "ar" ? "الضريبة" : "Tax"}</span>
                  <span>{fmtMoney(BigInt(Math.round(taxTotal * 100)), locale)}</span>
                </div>
              ) : null}
              <div className="flex justify-between">
                <span className="text-muted-foreground">{locale === "ar" ? "خصم إجمالي" : "Invoice discount"}</span>
                <Input
                  className="h-7 w-24 text-end"
                  type="number"
                  step="0.01"
                  value={discountTotal}
                  onChange={(e) => setDiscountTotal(Number(e.target.value))}
                />
              </div>
              <div className="flex justify-between border-t pt-1 text-base font-bold">
                <span>{locale === "ar" ? "الإجمالي" : "Total"}</span>
                <span className="text-primary">{fmtMoney(BigInt(Math.round(total * 100)), locale)}</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-1">
                {(["cash", "credit", "mixed"] as const).map((m) => (
                  <Button
                    key={m}
                    variant={paymentMethod === m ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPaymentMethod(m)}
                  >
                    {m === "cash" ? (locale === "ar" ? "نقداً" : "Cash") : m === "credit" ? (locale === "ar" ? "آجل" : "Credit") : locale === "ar" ? "مختلط" : "Mixed"}
                  </Button>
                ))}
              </div>
              {paymentMethod === "mixed" ? (
                <Input
                  type="number"
                  step="0.01"
                  placeholder={locale === "ar" ? "المبلغ المدفوع" : "Paid amount"}
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(Number(e.target.value))}
                />
              ) : null}
              {paymentMethod !== "credit" && cashAccounts.length > 0 ? (
                <Select value={cashAccountId} onValueChange={setCashAccountId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {cashAccounts.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.nameAr}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" size="icon" onClick={doHold} disabled={cart.length === 0 || pending}>
                <Pause />
              </Button>
              <Button className="flex-1" size="lg" onClick={doCheckout} disabled={cart.length === 0 || pending}>
                {locale === "ar" ? "إتمام البيع" : "Checkout"} — {fmtMoney(BigInt(Math.round(total * 100)), locale)}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!receipt} onOpenChange={(o) => !o && setReceipt(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{locale === "ar" ? "تم إتمام البيع" : "Sale completed"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-center">
            <p className="text-sm text-muted-foreground">{receipt?.invoiceNumber}</p>
            <p className="text-2xl font-bold">{receipt ? fmtMoney(BigInt(Math.round(receipt.total * 100)), locale) : ""}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceipt(null)}>{t("common.cancel")}</Button>
            <Button onClick={() => window.open(`/print/receipt/${receipt?.id}`, "_blank")}>
              {locale === "ar" ? "طباعة الإيصال" : "Print receipt"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
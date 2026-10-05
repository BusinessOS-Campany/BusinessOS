"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  Search,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  Banknote,
  CreditCard,
  Pause,
  ChevronUp,
  ChevronDown,
  X,
  CheckCircle2,
  User,
  Package,
  CircleDollarSign,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Product {
  id: string;
  sku: string;
  barcode: string;
  nameAr: string;
  nameEn: string;
  salePrice: number;
  costPrice: number;
  trackStock: boolean;
}

interface Customer {
  id: string;
  name: string;
  phone: string;
  creditLimit: number;
}

interface CartItem {
  productId: string;
  nameAr: string;
  nameEn: string;
  sku: string;
  unitPrice: number;
  qty: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString("ar-SA") + " ر.س";
}

const TAX_RATE = 0.15;

// ─── Cart Content ─────────────────────────────────────────────────────────────

interface CartContentProps {
  cart: CartItem[];
  cartItemCount: number;
  cartTotal: number;
  cartTax: number;
  cartGrand: number;
  customers: Customer[];
  selectedCustomerId: string;
  setSelectedCustomerId: (id: string) => void;
  clearCart: () => void;
  removeFromCart: (id: string) => void;
  updateQty: (id: string, delta: number) => void;
  handleCashPay: () => void;
  handleCreditPay: () => void;
  pending: boolean;
  setPartialOpen: (open: boolean) => void;
  setHoldOpen: (open: boolean) => void;
}

function CartContent({
  cart,
  cartItemCount,
  cartTotal,
  cartTax,
  cartGrand,
  customers,
  selectedCustomerId,
  setSelectedCustomerId,
  clearCart,
  removeFromCart,
  updateQty,
  handleCashPay,
  handleCreditPay,
  pending,
  setPartialOpen,
  setHoldOpen,
}: CartContentProps) {
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold text-foreground">
            سلة المشتريات
          </h2>
          {cartItemCount > 0 && (
            <Badge variant="default" className="text-xs">
              {cartItemCount}
            </Badge>
          )}
        </div>
        {cart.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearCart}
            className="text-muted-foreground hover:text-red-400 min-h-[44px] min-w-[44px]"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Customer selector */}
      <div className="border-b border-border px-4 py-3">
        <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <User className="h-3.5 w-3.5" />
          العميل / Customer
        </label>
        <select
          value={selectedCustomerId}
          onChange={(e) => setSelectedCustomerId(e.target.value)}
          className="w-full rounded-md border-border bg-card px-3 py-2.5 text-sm text-foreground min-h-[44px] focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">عميل نقدي / Walk-in</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} — {c.phone}
            </option>
          ))}
        </select>
      </div>

      {/* Cart items */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <ShoppingCart className="mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm">السلة فارغة</p>
            <p className="text-xs text-muted-foreground">اضغط على منتج لإضافته</p>
          </div>
        ) : (
          <div className="space-y-2">
            {cart.map((item) => (
              <div
                key={item.productId}
                className="rounded-lg bg-secondary p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {item.nameAr}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.sku}
                    </p>
                  </div>
                  <button
                    onClick={() => removeFromCart(item.productId)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-red-400 min-h-[44px] min-w-[44px]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => updateQty(item.productId, -1)}
                      className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-foreground hover:bg-muted min-h-[44px] min-w-[44px]"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-10 text-center text-sm font-bold text-foreground">
                      {item.qty}
                    </span>
                    <button
                      onClick={() => updateQty(item.productId, 1)}
                      className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-foreground hover:bg-muted min-h-[44px] min-w-[44px]"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="text-sm font-semibold text-primary">
                    {formatMoney(item.unitPrice * item.qty)}
                  </p>
                </div>
                {item.qty > 1 && (
                  <p className="mt-1 text-right text-xs text-muted-foreground">
                    {item.qty} × {formatMoney(item.unitPrice)}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Totals */}
      {cart.length > 0 && (
        <div className="border-t border-border px-4 py-3">
          <div className="mb-1 flex justify-between text-sm text-muted-foreground">
            <span>المجموع الفرعي</span>
            <span>{formatMoney(cartTotal)}</span>
          </div>
          <div className="mb-1 flex justify-between text-sm text-muted-foreground">
            <span>الضريبة (15%)</span>
            <span>{formatMoney(cartTax)}</span>
          </div>
          <div className="flex justify-between text-lg font-bold text-foreground">
            <span>الإجمالي</span>
            <span className="text-primary">{formatMoney(cartGrand)}</span>
          </div>
        </div>
      )}

      {/* Payment buttons */}
      <div className="border-t border-border px-4 py-3 space-y-2">
        <Button
          onClick={handleCashPay}
          disabled={cart.length === 0 || pending}
          className="w-full min-h-[52px] bg-primary text-base font-bold hover:bg-primary/90"
        >
          {pending ? (
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <>
              <Banknote className="ml-2 h-5 w-5" />
              نقدي / Cash
            </>
          )}
        </Button>
        <div className="grid grid-cols-3 gap-2">
          <Button
            onClick={handleCreditPay}
            disabled={cart.length === 0 || !selectedCustomerId || pending}
            variant="outline"
            className="min-h-[52px] border-amber-600 text-amber-400 hover:bg-amber-900/30 hover:text-amber-300"
          >
            <CreditCard className="ml-1 h-4 w-4" />
            <span className="text-xs">آجل</span>
          </Button>
          <Button
            onClick={() => setHoldOpen(true)}
            disabled={cart.length === 0 || pending}
            variant="outline"
            className="min-h-[52px] border-border text-card-foreground hover:bg-muted"
          >
            <Pause className="ml-1 h-4 w-4" />
            <span className="text-xs">احتفاظ</span>
          </Button>
          <Button
            onClick={() => setPartialOpen(true)}
            disabled={cart.length === 0 || pending}
            variant="outline"
            className="min-h-[52px] border-primary text-primary hover:bg-primary/10 hover:text-primary/80"
          >
            <CircleDollarSign className="ml-1 h-4 w-4" />
            <span className="text-xs">جزئي</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function POSPage() {
  // Products
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Customers
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);

  // Cart mobile panel
  const [cartOpen, setCartOpen] = useState(false);

  // Partial payment dialog
  const [partialOpen, setPartialOpen] = useState(false);
  const [partialAmount, setPartialAmount] = useState("");

  // Hold dialog
  const [holdNote, setHoldNote] = useState("");
  const [holdOpen, setHoldOpen] = useState(false);

  // Success overlay
  const [successData, setSuccessData] = useState<{
    number: string;
    total: number;
  } | null>(null);

  // Pending
  const [pending, setPending] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);

  // ── Load products & customers ────────────────────────────────────────────

  const loadProducts = useCallback(async (q = "") => {
    setProductsLoading(true);
    try {
      const res = await fetch(
        `/api/v1/products?q=${encodeURIComponent(q)}&limit=100`
      );
      const json = await res.json();
      if (json.ok) setProducts(json.data.products ?? []);
    } catch {
      // silently fail — keep previous
    } finally {
      setProductsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setProductsLoading(true);
      try {
        const res = await fetch("/api/v1/products?q=&limit=100");
        const json = await res.json();
        if (!cancelled && json.ok) setProducts(json.data.products ?? []);
      } catch {
        // silently fail
      } finally {
        if (!cancelled) setProductsLoading(false);
      }
      try {
        const res = await fetch("/api/v1/customers?q=&limit=100");
        const json = await res.json();
        if (!cancelled && json.ok) setCustomers(json.data.customers ?? []);
      } catch {
        // silently fail
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => {
      loadProducts(searchQuery);
    }, 350);
    return () => clearTimeout(t);
  }, [searchQuery, loadProducts]);

  // ── Cart helpers ────────────────────────────────────────────────────────

  function addToCart(product: Product) {
    setCart((prev) => {
      const existing = prev.find((c) => c.productId === product.id);
      if (existing) {
        return prev.map((c) =>
          c.productId === product.id ? { ...c, qty: c.qty + 1 } : c
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          nameAr: product.nameAr,
          nameEn: product.nameEn,
          sku: product.sku,
          unitPrice: product.salePrice,
          qty: 1,
        },
      ];
    });
  }

  function updateQty(productId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((c) =>
          c.productId === productId ? { ...c, qty: Math.max(0, c.qty + delta) } : c
        )
        .filter((c) => c.qty > 0)
    );
  }

  function removeFromCart(productId: string) {
    setCart((prev) => prev.filter((c) => c.productId !== productId));
  }

  function clearCart() {
    setCart([]);
    setSelectedCustomerId("");
  }

  const cartTotal = cart.reduce((sum, c) => sum + c.unitPrice * c.qty, 0);
  const cartTax = Math.round(cartTotal * TAX_RATE);
  const cartGrand = cartTotal + cartTax;
  const cartItemCount = cart.reduce((s, c) => s + c.qty, 0);

  // ── Actions ─────────────────────────────────────────────────────────────

  async function handleCashPay() {
    if (cart.length === 0 || pending) return;
    setPending(true);
    try {
      const res = await fetch("/api/v1/pos/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: selectedCustomerId || undefined,
          warehouseId: "default",
          items: cart.map((c) => ({
            productId: c.productId,
            qty: c.qty,
            unitPrice: c.unitPrice,
          })),
          cashPaid: cartGrand,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setSuccessData({
          number: json.data.number,
          total: json.data.total,
        });
        clearCart();
        setTimeout(() => setSuccessData(null), 3000);
      }
    } catch {
      // error toast could go here
    } finally {
      setPending(false);
    }
  }

  async function handleCreditPay() {
    if (cart.length === 0 || !selectedCustomerId || pending) return;
    setPending(true);
    try {
      const res = await fetch("/api/v1/pos/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: selectedCustomerId,
          warehouseId: "default",
          items: cart.map((c) => ({
            productId: c.productId,
            qty: c.qty,
            unitPrice: c.unitPrice,
          })),
          cashPaid: 0,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setSuccessData({
          number: json.data.number,
          total: json.data.total,
        });
        clearCart();
        setTimeout(() => setSuccessData(null), 3000);
      }
    } catch {
      // error toast
    } finally {
      setPending(false);
    }
  }

  async function handlePartialPay() {
    const amountCents = Math.round(parseFloat(partialAmount) * 100);
    if (cart.length === 0 || isNaN(amountCents) || amountCents <= 0 || pending)
      return;
    setPending(true);
    setPartialOpen(false);
    try {
      const res = await fetch("/api/v1/pos/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: selectedCustomerId || undefined,
          warehouseId: "default",
          items: cart.map((c) => ({
            productId: c.productId,
            qty: c.qty,
            unitPrice: c.unitPrice,
          })),
          cashPaid: amountCents,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setSuccessData({
          number: json.data.number,
          total: json.data.total,
        });
        clearCart();
        setTimeout(() => setSuccessData(null), 3000);
      }
    } catch {
      // error toast
    } finally {
      setPending(false);
      setPartialAmount("");
    }
  }

  async function handleHold() {
    if (cart.length === 0 || pending) return;
    setPending(true);
    setHoldOpen(false);
    try {
      const res = await fetch("/api/v1/pos/hold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: selectedCustomerId || undefined,
          warehouseId: "default",
          items: cart.map((c) => ({
            productId: c.productId,
            qty: c.qty,
            unitPrice: c.unitPrice,
          })),
          cashPaid: 0,
          notes: holdNote || undefined,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        clearCart();
        setHoldNote("");
      }
    } catch {
      // error toast
    } finally {
      setPending(false);
    }
  }

  // ── Filtered products ──────────────────────────────────────────────────

  const filteredProducts = products;

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      {/* Success overlay */}
      {successData && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="mx-4 flex flex-col items-center rounded-2xl bg-card p-8 shadow-2xl border border-primary/30 animate-in zoom-in-95 duration-300">
            <CheckCircle2 className="mb-4 h-16 w-16 text-primary" />
            <h3 className="mb-2 text-xl font-bold text-primary">
              تمت العملية بنجاح
            </h3>
            <p className="text-sm text-muted-foreground">
              فاتورة #{successData.number}
            </p>
            <p className="text-2xl font-bold text-foreground mt-2">
              {formatMoney(successData.total)}
            </p>
          </div>
        </div>
      )}

      {/* Hold dialog */}
      <Dialog open={holdOpen} onOpenChange={setHoldOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              احتفاظ بالسلة / Hold Cart
            </DialogTitle>
          </DialogHeader>
          <div>
            <label className="mb-1 block text-sm text-muted-foreground">
              ملاحظات (اختياري)
            </label>
            <Input
              value={holdNote}
              onChange={(e) => setHoldNote(e.target.value)}
              placeholder="أضف ملاحظة..."
              className="bg-card border-border text-foreground min-h-[44px]"
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setHoldOpen(false)}
              className="min-h-[44px]"
            >
              إلغاء
            </Button>
            <Button
              onClick={handleHold}
              disabled={pending}
              className="min-h-[44px]"
            >
              {pending ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                "احتفاظ"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Partial payment dialog */}
      <Dialog open={partialOpen} onOpenChange={setPartialOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              دفع جزئي / Partial Payment
            </DialogTitle>
          </DialogHeader>
          <div>
            <label className="mb-1 block text-sm text-muted-foreground">
              المبلغ المدفوع (ر.س)
            </label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={partialAmount}
              onChange={(e) => setPartialAmount(e.target.value)}
              placeholder="0.00"
              className="bg-card border-border text-foreground text-lg min-h-[44px]"
            />
            <p className="mt-2 text-sm text-muted-foreground">
              الإجمالي: {formatMoney(cartGrand)}
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setPartialOpen(false);
                setPartialAmount("");
              }}
              className="min-h-[44px]"
            >
              إلغاء
            </Button>
            <Button
              onClick={handlePartialPay}
              disabled={
                pending ||
                !partialAmount ||
                Math.round(parseFloat(partialAmount) * 100) <= 0
              }
              className="min-h-[44px]"
            >
              {pending ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                "تأكيد الدفع"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Desktop layout (3-column) ────────────────────────────────── */}
      <div className="hidden lg:grid lg:grid-cols-[1fr_380px] h-screen overflow-hidden">
        {/* Left: Product grid */}
        <div className="flex flex-col overflow-hidden border-l border-border">
          {/* Search bar */}
          <div className="border-b border-border bg-card p-4">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="بحث عن منتج... (الاسم / الكود / الباركود)"
                className="h-12 pr-10 bg-card border-border text-foreground text-base placeholder:text-muted-foreground focus-visible:ring-ring"
                dir="rtl"
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery("");
                    searchRef.current?.focus();
                  }}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground min-h-[44px] min-w-[44px] flex items-center justify-center"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Product grid */}
          <div className="flex-1 overflow-y-auto p-4">
            {productsLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <Package className="mb-3 h-12 w-12 opacity-30" />
                <p>لا توجد منتجات</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 2xl:grid-cols-3 gap-3">
                {filteredProducts.map((product) => {
                  const inCart = cart.find(
                    (c) => c.productId === product.id
                  );
                  return (
                    <button
                      key={product.id}
                      onClick={() => addToCart(product)}
                      className={cn(
                        "relative flex flex-col items-start rounded-xl border p-4 text-right transition-all min-h-[100px]",
                        "bg-secondary border-border hover:border-primary/50 hover:bg-secondary active:scale-[0.97]",
                        inCart &&
                          "border-primary ring-1 ring-primary/30 bg-primary/5"
                      )}
                    >
                      {inCart && (
                        <Badge
                          variant="default"
                          className="absolute left-2 top-2 text-[10px] px-1.5 py-0"
                        >
                          {inCart.qty}
                        </Badge>
                      )}
                      <span className="text-sm font-bold text-foreground line-clamp-2 mb-2">
                        {product.nameAr || product.nameEn}
                      </span>
                      {product.nameEn && product.nameAr && (
                        <span className="text-xs text-muted-foreground line-clamp-1 mb-auto">
                          {product.nameEn}
                        </span>
                      )}
                      <div className="mt-auto flex items-center justify-between w-full">
                        <span className="text-xs text-muted-foreground">
                          {product.sku}
                        </span>
                        <span className="text-base font-bold text-primary">
                          {formatMoney(product.salePrice)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Cart (desktop sidebar) */}
        <div className="flex flex-col bg-card h-screen overflow-hidden">
          <CartContent
  cart={cart}
  cartItemCount={cartItemCount}
  cartTotal={cartTotal}
  cartTax={cartTax}
  cartGrand={cartGrand}
  customers={customers}
  selectedCustomerId={selectedCustomerId}
  setSelectedCustomerId={setSelectedCustomerId}
  clearCart={clearCart}
  removeFromCart={removeFromCart}
  updateQty={updateQty}
  handleCashPay={handleCashPay}
  handleCreditPay={handleCreditPay}
  pending={pending}
  setPartialOpen={setPartialOpen}
  setHoldOpen={setHoldOpen}
/>
        </div>
      </div>

      {/* ─── Tablet layout (2-col) ───────────────────────────────────── */}
      <div className="hidden md:grid md:grid-cols-[1fr_340px] lg:hidden h-screen overflow-hidden">
        <div className="flex flex-col overflow-hidden border-l border-border">
          <div className="border-b border-border bg-card p-4">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="بحث عن منتج..."
                className="h-12 pr-10 bg-card border-border text-foreground"
                dir="rtl"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {productsLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <Package className="mb-3 h-12 w-12 opacity-30" />
                <p>لا توجد منتجات</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {filteredProducts.map((product) => {
                  const inCart = cart.find(
                    (c) => c.productId === product.id
                  );
                  return (
                    <button
                      key={product.id}
                      onClick={() => addToCart(product)}
                      className={cn(
                        "relative flex flex-col items-start rounded-xl border p-4 text-right transition-all min-h-[100px]",
                        "bg-secondary border-border hover:border-primary/50 active:scale-[0.97]",
                        inCart &&
                          "border-primary ring-1 ring-primary/30 bg-primary/5"
                      )}
                    >
                      {inCart && (
                        <Badge
                          variant="default"
                          className="absolute left-2 top-2 text-[10px] px-1.5 py-0"
                        >
                          {inCart.qty}
                        </Badge>
                      )}
                      <span className="text-sm font-bold text-foreground line-clamp-2 mb-2">
                        {product.nameAr || product.nameEn}
                      </span>
                      <div className="mt-auto flex items-center justify-between w-full">
                        <span className="text-xs text-muted-foreground">
                          {product.sku}
                        </span>
                        <span className="text-base font-bold text-primary">
                          {formatMoney(product.salePrice)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-col bg-card h-screen overflow-hidden">
          <CartContent
  cart={cart}
  cartItemCount={cartItemCount}
  cartTotal={cartTotal}
  cartTax={cartTax}
  cartGrand={cartGrand}
  customers={customers}
  selectedCustomerId={selectedCustomerId}
  setSelectedCustomerId={setSelectedCustomerId}
  clearCart={clearCart}
  removeFromCart={removeFromCart}
  updateQty={updateQty}
  handleCashPay={handleCashPay}
  handleCreditPay={handleCreditPay}
  pending={pending}
  setPartialOpen={setPartialOpen}
  setHoldOpen={setHoldOpen}
/>
        </div>
      </div>

      {/* ─── Mobile layout ───────────────────────────────────────────── */}
      <div className="md:hidden flex flex-col h-screen">
        {/* Mobile search */}
        <div className="border-b border-border bg-card p-3">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث..."
              className="h-12 pr-10 bg-card border-border text-foreground"
              dir="rtl"
            />
          </div>
        </div>

        {/* Mobile product grid */}
        <div className="flex-1 overflow-y-auto p-3 pb-24">
          {productsLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Package className="mb-3 h-12 w-12 opacity-30" />
              <p>لا توجد منتجات</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {filteredProducts.map((product) => {
                const inCart = cart.find(
                  (c) => c.productId === product.id
                );
                return (
                  <button
                    key={product.id}
                    onClick={() => addToCart(product)}
                    className={cn(
                      "relative flex flex-col items-start rounded-xl border p-3 text-right transition-all",
                      "bg-secondary border-border active:scale-[0.97]",
                      inCart &&
                        "border-primary ring-1 ring-primary/30 bg-primary/5"
                    )}
                  >
                    {inCart && (
                      <Badge
                        variant="default"
                        className="absolute left-2 top-2 text-[10px] px-1.5 py-0"
                      >
                        {inCart.qty}
                      </Badge>
                    )}
                    <span className="text-xs font-bold text-foreground line-clamp-2 mb-1">
                      {product.nameAr || product.nameEn}
                    </span>
                    <div className="mt-auto flex items-center justify-between w-full">
                      <span className="text-[10px] text-muted-foreground">
                        {product.sku}
                      </span>
                      <span className="text-sm font-bold text-primary">
                        {formatMoney(product.salePrice)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Mobile cart bottom bar */}
        {cart.length > 0 && (
          <div className="fixed bottom-0 inset-x-0 z-40">
            {/* Expanded cart panel */}
            {cartOpen && (
              <div className="bg-card border-t border-border max-h-[70vh] overflow-y-auto rounded-t-2xl shadow-2xl">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-card">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="h-5 w-5 text-primary" />
                    <span className="font-bold text-foreground">
                      السلة ({cartItemCount})
                    </span>
                  </div>
                  <button
                    onClick={() => setCartOpen(false)}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center"
                  >
                    <ChevronDown className="h-6 w-6 text-muted-foreground" />
                  </button>
                </div>
                <CartContent
  cart={cart}
  cartItemCount={cartItemCount}
  cartTotal={cartTotal}
  cartTax={cartTax}
  cartGrand={cartGrand}
  customers={customers}
  selectedCustomerId={selectedCustomerId}
  setSelectedCustomerId={setSelectedCustomerId}
  clearCart={clearCart}
  removeFromCart={removeFromCart}
  updateQty={updateQty}
  handleCashPay={handleCashPay}
  handleCreditPay={handleCreditPay}
  pending={pending}
  setPartialOpen={setPartialOpen}
  setHoldOpen={setHoldOpen}
/>
              </div>
            )}

            {/* Collapsed summary bar */}
            {!cartOpen && (
              <button
                onClick={() => setCartOpen(true)}
                className="w-full bg-card border-t border-border px-4 py-3 flex items-center justify-between active:bg-secondary min-h-[60px]"
              >
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <ShoppingCart className="h-6 w-6 text-primary" />
                    <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
                      {cartItemCount}
                    </span>
                  </div>
                  <span className="text-lg font-bold text-foreground">
                    {formatMoney(cartGrand)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    افتح السلة
                  </span>
                  <ChevronUp className="h-5 w-5 text-muted-foreground" />
                </div>
              </button>
            )}
          </div>
        )}

        {/* Mobile floating cart button when empty */}
        {cart.length === 0 && (
          <div className="fixed bottom-4 inset-x-4 z-40">
            <button
              onClick={() => setCartOpen(true)}
              className="w-full flex items-center justify-center gap-2 rounded-2xl bg-card border border-border py-4 text-muted-foreground min-h-[56px]"
            >
              <ShoppingCart className="h-5 w-5" />
              <span className="text-sm">السلة فارغة</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

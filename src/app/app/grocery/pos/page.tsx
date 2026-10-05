"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Search,
  ScanBarcode,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  CreditCard,
  Banknote,
  AlertCircle,
  CheckCircle,
  XCircle,
  Pause,
  Play,
  Receipt,
  User,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  barcode?: string;
}

interface HeldCart {
  id: string;
  customerName: string;
  items: CartItem[];
  total: number;
  heldAt: string;
}

interface Customer {
  id: string;
  name: string;
}

function formatMoney(amount: number): string {
  const riyals = amount / 100;
  return (
    riyals.toLocaleString("ar-SA", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " ر.س"
  );
}

export default function GroceryPOSPage() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    Array<{
      id: string;
      name: string;
      salePrice: number;
      currentStock: number;
      barcode?: string;
    }>
  >([]);
  const [selectedCustomer, setSelectedCustomer] = useState<string>("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [heldCarts, setHeldCarts] = useState<HeldCart[]>([]);
  const [showPayment, setShowPayment] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [receipt, setReceipt] = useState<{
    invoiceNo: string;
    total: number;
  } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  useEffect(() => {
    async function fetchCustomers() {
      const res = await fetch("/api/v1/grocery/customers?pageSize=100");
      const json = await res.json();
      if (json.ok) setCustomers(json.data.items ?? []);
    }
    fetchCustomers();
  }, []);

  const searchProducts = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    try {
      const res = await fetch(
        `/api/v1/grocery/products?search=${encodeURIComponent(query)}&pageSize=10`
      );
      const json = await res.json();
      if (json.ok) setSearchResults(json.data.items ?? []);
    } catch {
      setSearchResults([]);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      searchProducts(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, searchProducts]);

  function addToCart(product: {
    id: string;
    name: string;
    salePrice: number;
    barcode?: string;
  }) {
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        return prev.map((i) =>
          i.productId === product.id
            ? { ...i, quantity: i.quantity + 1 }
            : i
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          price: product.salePrice,
          quantity: 1,
          barcode: product.barcode,
        },
      ];
    });
    setSearchQuery("");
    setSearchResults([]);
    searchInputRef.current?.focus();
  }

  function updateQuantity(productId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((i) =>
          i.productId === productId
            ? { ...i, quantity: Math.max(0, i.quantity + delta) }
            : i
        )
        .filter((i) => i.quantity > 0)
    );
  }

  function removeFromCart(productId: string) {
    setCart((prev) => prev.filter((i) => i.productId !== productId));
  }

  const cartTotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const cartItemCount = cart.reduce((sum, i) => sum + i.quantity, 0);

  function holdCart() {
    if (cart.length === 0) return;
    const held: HeldCart = {
      id: Date.now().toString(),
      customerName:
        customers.find((c) => c.id === selectedCustomer)?.name ?? "عميل نقدي",
      items: [...cart],
      total: cartTotal,
      heldAt: new Date().toLocaleTimeString("ar-SA"),
    };
    setHeldCarts((prev) => [...prev, held]);
    setCart([]);
    setSelectedCustomer("");
  }

  function resumeCart(heldId: string) {
    const held = heldCarts.find((h) => h.id === heldId);
    if (!held) return;
    setCart(held.items);
    setHeldCarts((prev) => prev.filter((h) => h.id !== heldId));
  }

  async function completeSale() {
    if (cart.length === 0) return;
    setCompleting(true);
    try {
      const res = await fetch("/api/v1/grocery/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: selectedCustomer || null,
          paymentMethod,
          items: cart.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: i.price,
          })),
          total: cartTotal,
          paidAmount:
            paymentMethod === "credit" ? 0 : cartTotal,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setReceipt({
          invoiceNo: json.data.invoiceNo,
          total: cartTotal,
        });
        setCart([]);
        setSelectedCustomer("");
        setShowPayment(false);
      }
    } catch {
      // silent
    } finally {
      setCompleting(false);
    }
  }

  if (receipt) {
    return (
      <div dir="rtl" className="flex h-[calc(100vh-8rem)] items-center justify-center">
        <Card className="max-w-sm w-full text-center">
          <CardContent className="pt-8 pb-6">
            <CheckCircle className="mx-auto h-16 w-16 text-primary" />
            <h2 className="mt-4 text-xl font-bold text-foreground">
              تمت البيع بنجاح
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              رقم الفاتورة: {receipt.invoiceNo}
            </p>
            <p className="text-lg font-bold text-primary mt-2">
              {formatMoney(receipt.total)}
            </p>
            <Button
              className="mt-6 bg-primary hover:bg-primary/80 text-white"
              onClick={() => setReceipt(null)}
            >
              <Receipt className="ml-2 h-4 w-4" />
              فاتورة جديدة
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div dir="rtl" className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-8rem)]">
      {/* Right: Cart */}
      <div className="flex-1 flex flex-col min-w-0">
        <Card className="flex-1 flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm">
                <ShoppingCart className="h-4 w-4 text-primary" />
                سلة المشتريات
              </CardTitle>
              <Badge variant="secondary">{cartItemCount} صنف</Badge>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto pt-0">
            {cart.length === 0 ? (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <ShoppingCart className="mx-auto h-12 w-12 opacity-30" />
                  <p className="mt-3 text-sm">السلة فارغة</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {cart.map((item) => (
                  <div
                    key={item.productId}
                    className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {item.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatMoney(item.price)} × {item.quantity}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => updateQuantity(item.productId, -1)}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-8 text-center text-sm font-medium">
                        {item.quantity}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => updateQuantity(item.productId, 1)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-red-400 hover:text-red-300"
                        onClick={() => removeFromCart(item.productId)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    <span className="text-sm font-bold text-primary w-28 text-left">
                      {formatMoney(item.price * item.quantity)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>

          {/* Cart Footer */}
          <div className="border-t border-border px-4 py-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">الإجمالي</span>
              <span className="text-xl font-bold text-primary">
                {formatMoney(cartTotal)}
              </span>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={cart.length === 0}
                onClick={holdCart}
              >
                <Pause className="ml-1 h-4 w-4" />
                إيقاف
              </Button>
              <Button
                className="flex-1 bg-primary hover:bg-primary/80 text-white"
                disabled={cart.length === 0}
                onClick={() => setShowPayment(true)}
              >
                الدفع
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Left: Product Search + Held Carts */}
      <div className="lg:w-96 flex flex-col gap-4">
        {/* Search */}
        <Card>
          <CardContent className="pt-6">
            <div className="relative">
              <ScanBarcode className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                placeholder="بحث أو مسح الباركود..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-9"
              />
            </div>
            {searchResults.length > 0 && (
              <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-border">
                {searchResults.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p)}
                    className="flex w-full items-center justify-between px-3 py-2 text-right hover:bg-accent transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {p.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        المخزون: {p.currentStock}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-primary">
                      {formatMoney(p.salePrice)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Customer Selection */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">
                العميل
              </span>
            </div>
            <Select
              value={selectedCustomer}
              onValueChange={setSelectedCustomer}
            >
              <SelectTrigger>
                <SelectValue placeholder="عميل نقدي" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">عميل نقدي</SelectItem>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Held Carts */}
        {heldCarts.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                فواتير معلقة ({heldCarts.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {heldCarts.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => resumeCart(h.id)}
                    className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 hover:bg-accent transition-colors"
                  >
                    <div className="text-right">
                      <p className="text-sm font-medium text-foreground">
                        {h.customerName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {h.items.length} صنف — {h.heldAt}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
<span className="text-sm font-bold text-primary">
                        {formatMoney(h.total)}
                      </span>
                      <Play className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Payment Modal */}
      {showPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <Card className="mx-4 w-full max-w-md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>إتمام الدفع</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setShowPayment(false)}
                >
                  <XCircle className="h-5 w-5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">المبلغ الإجمالي</p>
                <p className="text-3xl font-bold text-primary">
                  {formatMoney(cartTotal)}
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  طريقة الدفع
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setPaymentMethod("cash")}
                    className={`flex flex-col items-center gap-1 rounded-lg border p-3 transition-colors ${
                      paymentMethod === "cash"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:bg-accent"
                    }`}
                  >
                    <Banknote className="h-5 w-5" />
                    <span className="text-xs">نقدي</span>
                  </button>
                  <button
                    onClick={() => setPaymentMethod("card")}
                    className={`flex flex-col items-center gap-1 rounded-lg border p-3 transition-colors ${
                      paymentMethod === "card"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:bg-accent"
                    }`}
                  >
                    <CreditCard className="h-5 w-5" />
                    <span className="text-xs">بطاقة</span>
                  </button>
                  <button
                    onClick={() => setPaymentMethod("credit")}
                    className={`flex flex-col items-center gap-1 rounded-lg border p-3 transition-colors ${
                      paymentMethod === "credit"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:bg-accent"
                    }`}
                  >
                    <AlertCircle className="h-5 w-5" />
                    <span className="text-xs">آجل</span>
                  </button>
                </div>
              </div>

              {paymentMethod === "credit" && !selectedCustomer && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2">
                  <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
                  <span className="text-xs text-amber-400">
                    يجب اختيار عميل للدفع الآجل
                  </span>
                </div>
              )}

              <Button
                className="w-full bg-primary hover:bg-primary/80 text-white"
                disabled={
                  completing ||
                  cart.length === 0 ||
                  (paymentMethod === "credit" && !selectedCustomer)
                }
                onClick={completeSale}
              >
                {completing ? "جاري المعالجة..." : "إتمام البيع"}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

import { Suspense } from "react";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/dal";
import { LANG_COOKIE, localeFrom } from "@/lib/i18n";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/print-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";

export const dynamic = "force-dynamic";

function fmtMoney(major: number, locale: "ar" | "en") {
  return new Intl.NumberFormat(locale === "ar" ? "ar-YE" : "en-US", { maximumFractionDigits: 2 }).format(major) + (locale === "ar" ? " ر.ي" : " YER");
}

async function SalesReport({ locale }: { locale: "ar" | "en" }) {
  const since = new Date(Date.now() - 30 * 86400000);
  const invoices = await prisma.salesInvoice.findMany({
    where: { issuedAt: { gte: since }, status: "posted" },
    orderBy: { issuedAt: "asc" },
  });
  const byDay = new Map<string, { count: number; total: number }>();
  for (const inv of invoices) {
    const key = inv.issuedAt.toISOString().slice(0, 10);
    const cur = byDay.get(key) ?? { count: 0, total: 0 };
    cur.count += 1;
    cur.total += Number(inv.total) / 100;
    byDay.set(key, cur);
  }
  const days = Array.from(byDay.entries());
  const grandTotal = days.reduce((s, d) => s + d[1].total, 0);

  const byMethod = new Map<string, { count: number; total: number }>();
  for (const inv of invoices) {
    const cur = byMethod.get(inv.paymentMethod) ?? { count: 0, total: 0 };
    cur.count += 1;
    cur.total += Number(inv.total) / 100;
    byMethod.set(inv.paymentMethod, cur);
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border p-4"><p className="text-sm text-muted-foreground">{locale === "ar" ? "الفواتير (30 يوم)" : "Invoices (30d)"}</p><p className="text-2xl font-bold">{invoices.length}</p></div>
        <div className="rounded-lg border p-4"><p className="text-sm text-muted-foreground">{locale === "ar" ? "الإجمالي" : "Total"}</p><p className="text-2xl font-bold">{fmtMoney(grandTotal, locale)}</p></div>
        <div className="rounded-lg border p-4"><p className="text-sm text-muted-foreground">{locale === "ar" ? "متوسط الفاتورة" : "Avg invoice"}</p><p className="text-2xl font-bold">{invoices.length ? fmtMoney(grandTotal / invoices.length, locale) : "0"}</p></div>
      </div>

      <div className="rounded-lg border p-4">
        <h3 className="mb-3 font-semibold">{locale === "ar" ? "المبيعات اليومية" : "Daily sales"}</h3>
        <div className="space-y-1">
          {days.map(([day, v]) => (
            <div key={day} className="flex items-center justify-between border-b py-1 text-sm last:border-0">
              <span className="text-muted-foreground">{new Date(day).toLocaleDateString(locale === "ar" ? "ar-YE" : "en-GB")}</span>
              <span>{v.count} {locale === "ar" ? "فاتورة" : "invoices"} — <strong>{fmtMoney(v.total, locale)}</strong></span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border p-4">
        <h3 className="mb-3 font-semibold">{locale === "ar" ? "حسب طريقة الدفع" : "By payment method"}</h3>
        <div className="space-y-1">
          {Array.from(byMethod.entries()).map(([m, v]) => (
            <div key={m} className="flex items-center justify-between border-b py-1 text-sm last:border-0">
              <span className="text-muted-foreground">{m}</span>
              <span>{v.count} — <strong>{fmtMoney(v.total, locale)}</strong></span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

async function InventoryReport({ locale }: { locale: "ar" | "en" }) {
  const [stocks, medicines] = await Promise.all([
    prisma.stockLevel.findMany(),
    prisma.medicine.findMany({ where: { isActive: true } }),
  ]);
  const medMap = new Map(medicines.map((m) => [m.id, m]));
  const totals = new Map<string, number>();
  for (const s of stocks) totals.set(s.medicineId, (totals.get(s.medicineId) ?? 0) + Number(s.qty));

  const rows = Array.from(totals.entries())
    .map(([id, qty]) => {
      const m = medMap.get(id);
      return {
        name: m ? (locale === "ar" ? m.nameAr : m.nameEn ?? m.nameAr) : "—",
        qty,
        cost: m ? Number(m.purchasePrice) / 100 : 0,
        price: m ? Number(m.salePrice) / 100 : 0,
        value: m ? (qty * Number(m.purchasePrice)) / 100 : 0,
      };
    })
    .sort((a, b) => b.value - a.value);

  const stockValue = rows.reduce((s, r) => s + r.value, 0);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border p-4 text-lg"><strong>{locale === "ar" ? "قيمة المخزون (بتكلفة الشراء): " : "Stock value (at cost): "}</strong>{fmtMoney(stockValue, locale)}</div>
      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-start">
            <tr>
              <th className="px-4 py-2 text-start">{locale === "ar" ? "الصنف" : "Item"}</th>
              <th className="px-4 py-2 text-end">{locale === "ar" ? "الكمية" : "Qty"}</th>
              <th className="px-4 py-2 text-end">{locale === "ar" ? "التكلفة" : "Cost"}</th>
              <th className="px-4 py-2 text-end">{locale === "ar" ? "البيع" : "Sale"}</th>
              <th className="px-4 py-2 text-end">{locale === "ar" ? "القيمة" : "Value"}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-b last:border-0">
                <td className="px-4 py-2">{r.name}</td>
                <td className="px-4 py-2 text-end">{r.qty}</td>
                <td className="px-4 py-2 text-end">{fmtMoney(r.cost, locale)}</td>
                <td className="px-4 py-2 text-end">{fmtMoney(r.price, locale)}</td>
                <td className="px-4 py-2 text-end">{fmtMoney(r.value, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

async function ExpiryReport({ locale }: { locale: "ar" | "en" }) {
  const horizon = new Date(Date.now() + 90 * 86400000);
  const batches = await prisma.medicineBatch.findMany({
    where: { expiryDate: { lte: horizon }, remainingQty: { gt: 0 }, status: "active" },
    orderBy: { expiryDate: "asc" },
    take: 500,
  });
  const medicines = await prisma.medicine.findMany();
  const medMap = new Map(medicines.map((m) => [m.id, m]));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{locale === "ar" ? "دفعات تنتهي خلال 90 يوماً ولا يزال عليها مخزون" : "Batches expiring within 90 days with remaining stock"}</p>
      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-4 py-2 text-start">{locale === "ar" ? "الصنف" : "Item"}</th>
              <th className="px-4 py-2 text-start">{locale === "ar" ? "الدفعة" : "Batch"}</th>
              <th className="px-4 py-2 text-end">{locale === "ar" ? "المتبقي" : "Remaining"}</th>
              <th className="px-4 py-2 text-end">{locale === "ar" ? "تاريخ الانتهاء" : "Expiry"}</th>
              <th className="px-4 py-2 text-end">{locale === "ar" ? "الأيام المتبقية" : "Days left"}</th>
            </tr>
          </thead>
          <tbody>
            {batches.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">{locale === "ar" ? "لا توجد دفعات قريبة الانتهاء" : "No expiring batches"}</td></tr>
            ) : (
              batches.map((b) => {
                const m = medMap.get(b.medicineId);
                const days = Math.ceil((b.expiryDate.getTime() - Date.now()) / 86400000);
                return (
                  <tr key={b.id} className="border-b last:border-0">
                    <td className="px-4 py-2">{m ? (locale === "ar" ? m.nameAr : m.nameEn ?? m.nameAr) : "—"}</td>
                    <td className="px-4 py-2 font-mono text-xs">{b.batchNo}</td>
                    <td className="px-4 py-2 text-end">{Number(b.remainingQty)}</td>
                    <td className="px-4 py-2 text-end">{b.expiryDate.toLocaleDateString(locale === "ar" ? "ar-YE" : "en-GB")}</td>
                    <td className={`px-4 py-2 text-end ${days < 0 ? "text-destructive" : "text-amber-600"}`}>{days < 0 ? locale === "ar" ? "منتهية" : "Expired" : days}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

async function ExpensesReport({ locale }: { locale: "ar" | "en" }) {
  const since = new Date();
  since.setDate(1);
  const [expenses, categories] = await Promise.all([
    prisma.expense.findMany({ where: { paidAt: { gte: since } }, orderBy: { paidAt: "asc" } }),
    prisma.expenseCategory.findMany(),
  ]);
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const byCatEntries = Array.from(expenses.reduce((map, e) => {
    const name = e.categoryId && catMap.get(e.categoryId) ? (locale === "ar" ? catMap.get(e.categoryId)!.nameAr : catMap.get(e.categoryId)!.nameEn ?? catMap.get(e.categoryId)!.nameAr) : labelOther(locale);
    map.set(name, (map.get(name) ?? 0) + Number(e.amount) / 100);
    return map;
  }, new Map<string, number>()).entries());

  const total = byCatEntries.reduce((s, [, v]) => s + v, 0);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-4 text-lg"><strong>{locale === "ar" ? "مصروفات الشهر الحالي: " : "This month expenses: "}</strong>{fmtMoney(total, locale)}</div>
      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-4 py-2 text-start">{locale === "ar" ? "التصنيف" : "Category"}</th>
              <th className="px-4 py-2 text-end">{locale === "ar" ? "الإجمالي" : "Total"}</th>
            </tr>
          </thead>
          <tbody>
            {byCatEntries.map(([name, v]) => (
              <tr key={name} className="border-b last:border-0">
                <td className="px-4 py-2">{name}</td>
                <td className="px-4 py-2 text-end">{fmtMoney(v, locale)}</td>
              </tr>
            ))}
            {byCatEntries.length === 0 && (
              <tr><td colSpan={2} className="px-4 py-8 text-center text-muted-foreground">{locale === "ar" ? "لا توجد مصروفات" : "No expenses"}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function labelOther(locale: "ar" | "en") {
  return locale === "ar" ? "أخرى" : "Other";
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const cookieStore = await cookies();
  const locale = localeFrom(cookieStore.get(LANG_COOKIE)?.value);
  await requirePermission("reports:view");
  const { type = "sales" } = await searchParams;

  const tabs = [
    ["sales", locale === "ar" ? "المبيعات" : "Sales"],
    ["inventory", locale === "ar" ? "المخزون" : "Inventory"],
    ["expiry", locale === "ar" ? "الانتهاء" : "Expiry"],
    ["expenses", locale === "ar" ? "المصروفات" : "Expenses"],
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={locale === "ar" ? "التقارير" : "Reports"}
        description={locale === "ar" ? "تقارير المبيعات والمخزون" : "Sales, inventory and financial reports"}
        actions={<PrintButton label={locale === "ar" ? "طباعة" : "Print"} />}
      />

      <Tabs value={type}>
        <TabsList>
          {tabs.map(([v, l]) => (
            <TabsTrigger key={v} value={v} asChild>
              <Link href={`/reports?type=${v}`}>{l}</Link>
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="sales" className="mt-4"><Suspense fallback={null}><SalesReport locale={locale} /></Suspense></TabsContent>
        <TabsContent value="inventory" className="mt-4"><Suspense fallback={null}><InventoryReport locale={locale} /></Suspense></TabsContent>
        <TabsContent value="expiry" className="mt-4"><Suspense fallback={null}><ExpiryReport locale={locale} /></Suspense></TabsContent>
        <TabsContent value="expenses" className="mt-4"><Suspense fallback={null}><ExpensesReport locale={locale} /></Suspense></TabsContent>
      </Tabs>
    </div>
  );
}
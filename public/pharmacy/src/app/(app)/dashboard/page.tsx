import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/dal";
import { fromMinor, fmtMoney, fmtNumber, fmtDate, daysAgo } from "@/lib/format";
import { StatCard } from "@/components/stat-card";
import { SalesChart } from "@/components/dashboard/sales-chart";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Banknote,
  TrendingUp,
  PackageX,
  CalendarClock,
  Pill,
  Users,
} from "lucide-react";
import { cookies } from "next/headers";
import { LANG_COOKIE, localeFrom, translate } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const locale = localeFrom(cookieStore.get(LANG_COOKIE)?.value);
  await requireAuth();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sevenDaysAgo = daysAgo(6);
  const in60Days = new Date();
  in60Days.setDate(in60Days.getDate() + 60);

  const [todayInvoices, recentInvoices, medicineCount, customerCount, lowStock, expiring, last7] =
    await Promise.all([
      prisma.salesInvoice.findMany({
        where: { status: "posted", issuedAt: { gte: today } },
        select: { total: true, paidTotal: true, id: true },
      }),
      prisma.salesInvoice.findMany({
        where: { status: "posted" },
        orderBy: { issuedAt: "desc" },
        take: 8,
        select: {
          id: true,
          invoiceNumber: true,
          total: true,
          paidTotal: true,
          paymentMethod: true,
          issuedAt: true,
          customerId: true,
        },
      }),
      prisma.medicine.count({ where: { isActive: true } }),
      prisma.customer.count({ where: { isActive: true } }),
      prisma.stockLevel.findMany({
        select: { qty: true, medicineId: true },
      }),
      prisma.medicineBatch.findMany({
        where: { status: "active", remainingQty: { gt: 0 }, expiryDate: { lte: in60Days } },
        select: { id: true, batchNo: true, expiryDate: true, remainingQty: true, medicineId: true },
        orderBy: { expiryDate: "asc" },
        take: 6,
      }),
      prisma.salesInvoice.findMany({
        where: { status: "posted", issuedAt: { gte: sevenDaysAgo } },
        select: { issuedAt: true, total: true },
      }),
    ]);

  const todaySales = todayInvoices.reduce((s, i) => s + Number(i.total), 0);
  const lowStockItems = lowStock.filter((s) => Number(s.qty) <= 20).length;

  const medicineIds = [...new Set(expiring.map((e) => e.medicineId))];
  const medicineNames = await prisma.medicine.findMany({
    where: { id: { in: medicineIds } },
    select: { id: true, nameAr: true, nameEn: true },
  });
  const nameMap = new Map(medicineNames.map((m) => [m.id, m]));

  const customerIds = [...new Set(recentInvoices.map((i) => i.customerId).filter(Boolean))] as string[];
  const customers = await prisma.customer.findMany({
    where: { id: { in: customerIds } },
    select: { id: true, name: true },
  });
  const customerMap = new Map(customers.map((c) => [c.id, c.name]));

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const chartData = days.map((d) => {
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    const total = last7
      .filter((inv) => inv.issuedAt >= d && inv.issuedAt < next)
      .reduce((s, inv) => s + Number(inv.total), 0) / 100;
    return {
      date: d.toLocaleDateString(locale === "ar" ? "ar-YE" : "en-GB", { weekday: "short" }),
      total: Math.round(total),
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={translate(locale, "nav.dashboard")}
        description={
          locale === "ar"
            ? "نظرة عامة على أداء الصيدلية اليوم"
            : "An overview of your pharmacy performance today"
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          title={locale === "ar" ? "مبيعات اليوم" : "Today's sales"}
          value={fmtMoney(BigInt(Math.round(todaySales)), locale)}
          hint={`${fmtNumber(todayInvoices.length)} ${locale === "ar" ? "فاتورة" : "invoices"}`}
          icon={Banknote}
          tone="success"
        />
        <StatCard
          title={locale === "ar" ? "عدد الأصناف" : "Medicines"}
          value={fmtNumber(medicineCount)}
          hint={locale === "ar" ? "صنف دواء" : "active items"}
          icon={Pill}
        />
        <StatCard
          title={locale === "ar" ? "العملاء" : "Customers"}
          value={fmtNumber(customerCount)}
          icon={Users}
        />
        <StatCard
          title={locale === "ar" ? "مخزون منخفض" : "Low stock"}
          value={fmtNumber(lowStockItems)}
          hint={locale === "ar" ? "يحتاج إعادة طلب" : "needs reorder"}
          icon={PackageX}
          tone="warning"
        />
        <StatCard
          title={locale === "ar" ? "قريبة الانتهاء" : "Expiring soon"}
          value={fmtNumber(expiring.length)}
          hint={locale === "ar" ? "خلال 60 يوماً" : "within 60 days"}
          icon={CalendarClock}
          tone="danger"
        />
        <StatCard
          title={locale === "ar" ? "متوسط الفاتورة" : "Avg. invoice"}
          value={fmtMoney(
            todayInvoices.length ? BigInt(Math.round(todaySales / todayInvoices.length)) : 0n,
            locale
          )}
          icon={TrendingUp}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4" />
              {locale === "ar" ? "المبيعات - آخر 7 أيام" : "Sales — last 7 days"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SalesChart data={chartData} locale={locale} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-4 w-4" />
              {locale === "ar" ? "دفعات قريبة الانتهاء" : "Batches expiring soon"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {expiring.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {locale === "ar" ? "لا توجد دفعات قريبة الانتهاء" : "No batches expiring soon"}
              </p>
            ) : (
              expiring.map((b) => {
                const m = nameMap.get(b.medicineId);
                return (
                  <div key={b.id} className="flex items-center justify-between gap-3 border-b pb-2 last:border-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {locale === "ar" ? m?.nameAr : m?.nameEn ?? m?.nameAr}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {b.batchNo} · {fmtDate(b.expiryDate, locale)}
                      </p>
                    </div>
                    <Badge variant="warning">{fmtNumber(Number(b.remainingQty))}</Badge>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {locale === "ar" ? "أحدث الفواتير" : "Recent invoices"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {recentInvoices.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {locale === "ar" ? "لا توجد فواتير بعد" : "No invoices yet"}
            </p>
          ) : (
            recentInvoices.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between gap-3 border-b pb-2 last:border-0">
                <div>
                  <p className="text-sm font-medium">{inv.invoiceNumber}</p>
                  <p className="text-xs text-muted-foreground">
                    {inv.customerId ? customerMap.get(inv.customerId) ?? "—" : locale === "ar" ? "عميل نقدي" : "Walk-in"} ·{" "}
                    {fmtDate(inv.issuedAt, locale)}
                  </p>
                </div>
                <div className="text-end">
                  <p className="text-sm font-semibold">{fmtMoney(inv.total, locale)}</p>
                  <Badge variant={Number(inv.paidTotal) >= Number(inv.total) ? "success" : "warning"}>
                    {Number(inv.paidTotal) >= Number(inv.total)
                      ? locale === "ar"
                        ? "مدفوع"
                        : "Paid"
                      : locale === "ar"
                        ? "جزئي"
                        : "Partial"}
                  </Badge>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
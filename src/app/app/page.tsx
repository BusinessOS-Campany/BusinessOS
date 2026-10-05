import Link from "next/link";
import {
  TrendingUp,
  DollarSign,
  Package,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  CalendarDays,
  Activity,
  type LucideIcon,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LazyBarChart } from "@/components/dashboard-charts";
import { cn } from "@/lib/utils";
import { requireTenantPage } from "@/core/tenancy/page-guard";
import { getRenderSession } from "@/core/tenancy/request-context";
import { hasPermission } from "@/core/db/tenant-guard";
import { ReportsService } from "@/core/reports/service";
import { prisma, sharedPrisma } from "@/core/db/client";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatMoney(amount: number): string {
  const riyals = amount / 100;
  return (
    riyals.toLocaleString("ar-SA", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }) + " ر.س"
  );
}

function arabicDate(): string {
  return new Date().toLocaleDateString("ar-SA", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** BigInt money arrives over the wire as number (see `toJsonSafe`). */
function money(value: bigint | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "bigint" ? Number(value) : value;
}

/* ------------------------------------------------------------------ */
/*  KPI Card                                                           */
/* ------------------------------------------------------------------ */

function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor,
  trend,
  trendLabel,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  iconColor: string;
  trend?: "up" | "down" | "neutral";
  trendLabel?: string;
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className={cn("rounded-lg p-2", iconColor)}>
          <Icon className="h-4 w-4 text-white" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-primary">{value}</div>
        <div className="mt-1 flex items-center gap-1 text-xs">
          {trend === "up" && (
            <ArrowUpRight className="h-3 w-3 text-primary" />
          )}
          {trend === "down" && (
            <ArrowDownRight className="h-3 w-3 text-red-400" />
          )}
          {trendLabel && (
            <span
              className={cn(
                trend === "up" && "text-primary",
                trend === "down" && "text-red-400",
                trend === "neutral" && "text-muted-foreground"
              )}
            >
              {trendLabel}
            </span>
          )}
          {subtitle && !trendLabel && (
            <span className="text-muted-foreground">{subtitle}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Dashboard                                                     */
/* ------------------------------------------------------------------ */

const PERIOD_DAYS = 30;

/**
 * Tenant dashboard.
 *
 * Rendered on the server: the figures come from the same `ReportsService` the
 * summary API uses, read directly instead of fetched from the browser after
 * hydration. That removes a client-side round trip on every visit and, more
 * importantly, means the page ships its own numbers — previously the client
 * component read field names the endpoint never returned, so the KPIs rendered
 * as zero.
 */
export default async function TenantDashboard() {
  const session = await getRenderSession();
  const { tenant } = await requireTenantPage();

  const canSeeMoney = hasPermission(tenant.role, { finance: ["read"] });

  const to = new Date();
  const from = new Date(to.getTime() - PERIOD_DAYS * 24 * 60 * 60 * 1000);

  const svc = new ReportsService(prisma);
  const orgId = tenant.organizationId;

  // Same split the summary endpoint applies: money figures require
  // finance.read, everyone else still gets the operational tiles.
  const [sales, profit, inventory, debt, cashflow, org] = await Promise.all([
    svc.salesSummary(orgId, from, to),
    canSeeMoney ? svc.grossProfit(orgId, from, to) : Promise.resolve(null),
    svc.inventoryValuation(orgId),
    canSeeMoney ? svc.debtReport(orgId) : Promise.resolve(null),
    canSeeMoney ? svc.cashflow(orgId, from, to) : Promise.resolve(null),
    sharedPrisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true },
    }),
  ]);

  const userName = session?.user.name ?? session?.user.email ?? "";
  const orgName = org?.name ?? "";

  const totalSales = money(sales.total);
  const grossProfit = money(profit?.profit ?? 0n);
  const revenue = money(profit?.revenue ?? 0n);
  const inventoryValue = money(inventory.costValue);
  const lowStockCount = inventory.lowStockTotal;
  const totalReceivable = money(debt?.totalReceivable ?? 0n);
  const debtorCount = debt?.customerCount ?? 0;
  const cashIn = money(cashflow?.inflow ?? 0n);
  const cashOut = money(cashflow?.outflow ?? 0n);
  const netCash = cashIn + cashOut;

  const salesProfitChart = canSeeMoney
    ? [
        {
          name: "المبيعات",
          المبيعات: totalSales,
          الربح: grossProfit,
        },
      ]
    : [{ name: "المبيعات", المبيعات: totalSales }];

  const cashflowChart = [
    {
      name: "التدفقات",
      الوارد: cashIn,
      الصادر: cashOut,
    },
  ];

  return (
    <div dir="rtl" className="space-y-6">
      {/* ---- Welcome Banner ---- */}
      <Card className="border-primary/20 bg-gradient-to-l from-primary/10 to-background dark:from-primary/10 dark:to-background">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                مرحباً، {userName}
              </h1>
              {orgName && (
                <p className="mt-1 text-sm text-muted-foreground">{orgName}</p>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarDays className="h-4 w-4" />
              <span>{arabicDate()}</span>
            </div>
          </div>
          <div className="mt-3">
            <Badge variant="secondary" className="text-xs">
              آخر {PERIOD_DAYS} يوم
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* ---- KPI Cards ---- */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="المبيعات"
          value={formatMoney(totalSales)}
          subtitle={`${sales.invoices} فاتورة`}
          icon={TrendingUp}
          iconColor="bg-primary"
          trend="up"
          trendLabel={`${sales.invoices} فاتورة`}
        />
        {canSeeMoney ? (
          <KpiCard
            title="الربح"
            value={formatMoney(grossProfit)}
            subtitle={`الإيراد: ${formatMoney(revenue)}`}
            icon={DollarSign}
            iconColor="bg-primary/80"
            trend={grossProfit >= 0 ? "up" : "down"}
            trendLabel={
              revenue > 0
                ? `${((grossProfit / revenue) * 100).toFixed(1)}%`
                : undefined
            }
          />
        ) : (
          <KpiCard
            title="عدد الفواتير"
            value={String(sales.invoices)}
            subtitle="الفترة الأخيرة"
            icon={DollarSign}
            iconColor="bg-primary/80"
            trend="neutral"
          />
        )}
        <KpiCard
          title="قيمة المخزون"
          value={formatMoney(inventoryValue)}
          icon={Package}
          iconColor="bg-neutral-600"
          trend="neutral"
          trendLabel={`${lowStockCount} منخفض`}
        />
        <KpiCard
          title="الديون المدينة"
          value={formatMoney(totalReceivable)}
          subtitle={`${debtorCount} عميل`}
          icon={AlertTriangle}
          iconColor="bg-amber-600"
          trend={totalReceivable > 0 ? "down" : "neutral"}
          trendLabel={`${debtorCount} عميل`}
        />
      </div>

      {/* ---- Charts ---- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Sales vs Profit */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm text-card-foreground">
              <TrendingUp className="h-4 w-4 text-primary" />
              المبيعات مقابل الربح — {PERIOD_DAYS} يوم
            </CardTitle>
          </CardHeader>
          <CardContent>
            <LazyBarChart
              data={salesProfitChart}
              series={
                canSeeMoney
                  ? [
                      { key: "المبيعات", color: "#03EABC" },
                      { key: "الربح", color: "#0263D1" },
                    ]
                  : [{ key: "المبيعات", color: "#03EABC" }]
              }
            />
          </CardContent>
        </Card>

        {/* Cash Inflow vs Outflow */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm text-card-foreground">
              <Activity className="h-4 w-4 text-primary" />
              التدفقات النقدية — {PERIOD_DAYS} يوم
            </CardTitle>
          </CardHeader>
          <CardContent>
            <LazyBarChart
              data={cashflowChart}
              series={[
                { key: "الوارد", color: "#03EABC" },
                { key: "الصادر", color: "#525252" },
              ]}
            />

            {/* Net cashflow badge */}
            <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
              <span className="text-xs text-muted-foreground">صافي التدفق</span>
              <Badge variant={netCash >= 0 ? "success" : "destructive"}>
                {netCash >= 0 ? "▲" : "▼"} {formatMoney(Math.abs(netCash))}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ---- Quick Stats ---- */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Low Stock */}
        <Card className="group relative overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-card-foreground">
              <Package className="h-4 w-4 text-amber-400" />
              تنبيه المخزون
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-3xl font-bold text-amber-400">{lowStockCount}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  منتج بكمية منخفضة
                </p>
              </div>
              <Link
                href="/app/inventory"
                className="flex items-center gap-1 text-xs text-primary opacity-0 transition-opacity group-hover:opacity-100 hover:text-primary/80"
              >
                عرض المخزون
                <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          </CardContent>
          <div className="absolute bottom-0 left-0 h-1 w-full bg-gradient-to-l from-amber-500/40 to-transparent" />
        </Card>

        {/* Pending Debt */}
        <Card className="group relative overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-card-foreground">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              الديون المستحقة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-3xl font-bold text-red-400">
                  {formatMoney(totalReceivable)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  من {debtorCount} عميل
                </p>
              </div>
              <Link
                href="/app/customers"
                className="flex items-center gap-1 text-xs text-primary opacity-0 transition-opacity group-hover:opacity-100 hover:text-primary/80"
              >
                عرض العملاء
                <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          </CardContent>
          <div className="absolute bottom-0 left-0 h-1 w-full bg-gradient-to-l from-red-500/40 to-transparent" />
        </Card>
      </div>
    </div>
  );
}

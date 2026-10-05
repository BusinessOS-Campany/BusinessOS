import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getT } from "@/shared/i18n";
import { formatMoney, formatNumber } from "@/shared/core/format";
import { parseReportRange } from "@/features/reports/schema";
import { salesReport } from "@/features/reports/service";
import { ReportHeader, SummaryCards, ReportSection } from "@/features/reports/ui/report-shell";

export default async function SalesReportPage({ searchParams }: PageProps<"/reports/sales">) {
  const { t, locale } = await getT();
  const sp = await searchParams;
  const range = parseReportRange({ from: sp.from, to: sp.to });
  const { summary, buckets, byCashier, products } = await salesReport(range);
  const dayTotals = buckets.reduce(
    (acc, b) => ({ revenue: acc.revenue + b.revenue, cost: acc.cost + b.cost, profit: acc.profit + b.profit }),
    { revenue: 0, cost: 0, profit: 0 },
  );

  return (
    <ReportHeader
        title={t.reports.salesReport} basePath="/reports/sales" family="sales"
        fromISO={range.fromISO} toISO={range.toISO}
      >
      <SummaryCards items={[
        { label: t.reports.invoicesCol, value: formatNumber(summary.invoices, locale) },
        { label: t.reports.grossSales, value: formatMoney(summary.grossSales, locale) },
        { label: t.reports.returns, value: formatMoney(summary.returnsTotal, locale) },
        { label: t.reports.netSales, value: formatMoney(summary.netSales, locale), accent: true },
        { label: t.reports.cogs, value: formatMoney(summary.cogs, locale) },
        { label: t.common.discount, value: formatMoney(summary.discounts, locale) },
        { label: t.reports.avgTicket, value: formatMoney(summary.avgTicket, locale) },
      ]} />

      <ReportSection title={t.reports.byDay}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cell-th-date">{t.reports.dateRange}</TableHead>
              <TableHead className="cell-th-income text-end">{t.reports.revenueCol}</TableHead>
              <TableHead className="cell-th-expense text-end">{t.reports.cogs}</TableHead>
              <TableHead className="cell-th-net text-end">{t.reports.grossProfit}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {buckets.map((b) => (
              <TableRow key={b.day}>
                <TableCell className="cell-date" dir="ltr">{b.day}</TableCell>
                <TableCell className="cell-income text-end tabular-nums">{formatMoney(b.revenue, locale)}</TableCell>
                <TableCell className="cell-expense text-end tabular-nums">{formatMoney(b.cost, locale)}</TableCell>
                <TableCell className="cell-net text-end tabular-nums">{formatMoney(b.profit, locale)}</TableCell>
              </TableRow>
            ))}
            {buckets.length === 0 && (
              <TableRow><TableCell colSpan={4} className="h-20 text-center text-muted-foreground">{t.common.noData}</TableCell></TableRow>
            )}
          </TableBody>
          <TableFooter>
            <TableRow className="grand-total">
              <TableCell className="cell-date font-bold">{t.reports.csv.totals}</TableCell>
              <TableCell className="cell-income text-end font-bold tabular-nums">{formatMoney(dayTotals.revenue, locale)}</TableCell>
              <TableCell className="cell-expense text-end font-bold tabular-nums">{formatMoney(dayTotals.cost, locale)}</TableCell>
              <TableCell className="cell-net text-end font-bold tabular-nums">{formatMoney(dayTotals.profit, locale)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </ReportSection>

      <div className="grid gap-4 lg:grid-cols-2">
        <ReportSection title={t.reports.cashierReport}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cell-th-notes">{t.usersPage.fullName}</TableHead>
                <TableHead className="cell-th-date text-end">{t.reports.invoicesCol}</TableHead>
                <TableHead className="cell-th-net text-end">{t.reports.netSales}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byCashier.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.nameAr ?? c.name}</TableCell>
                  <TableCell className="cell-date text-end tabular-nums">{formatNumber(c.qty, locale)}</TableCell>
                  <TableCell className="cell-net text-end tabular-nums">{formatMoney(c.total, locale)}</TableCell>
                </TableRow>
              ))}
              {byCashier.length === 0 && (
                <TableRow><TableCell colSpan={3} className="h-20 text-center text-muted-foreground">{t.common.noData}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </ReportSection>

        <ReportSection title={t.reports.productPerformance}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cell-th-notes">{t.products.name}</TableHead>
                <TableHead className="cell-th-date text-end">{t.reports.unitsSold}</TableHead>
                <TableHead className="cell-th-income text-end">{t.reports.revenueCol}</TableHead>
                <TableHead className="cell-th-net text-end">{t.reports.grossProfit}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="max-w-48 truncate font-medium">{p.nameAr ?? p.name}</TableCell>
                  <TableCell className="cell-date text-end tabular-nums">{formatNumber(p.qty, locale)}</TableCell>
                  <TableCell className="cell-income text-end tabular-nums">{formatMoney(p.total, locale)}</TableCell>
                  <TableCell className="cell-net text-end tabular-nums">{formatMoney(p.profit, locale)}</TableCell>
                </TableRow>
              ))}
              {products.length === 0 && (
                <TableRow><TableCell colSpan={4} className="h-20 text-center text-muted-foreground">{t.common.noData}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </ReportSection>
      </div>

      <div className="sama-summary hidden print:block">
        <p className="sama-summary-head">{t.reports.financialSummary}</p>
        <table className="sama-summary-table">
          <tbody>
            <tr><td className="sum-key">{t.reports.invoicesCol}</td><td className="sum-val">{formatNumber(summary.invoices, locale)}</td></tr>
            <tr><td className="sum-key">{t.reports.grossSales}</td><td className="sum-val sum-income">{formatMoney(summary.grossSales, locale)}</td></tr>
            <tr><td className="sum-key">{t.reports.returns}</td><td className="sum-val sum-expense">{formatMoney(summary.returnsTotal, locale)}</td></tr>
            <tr><td className="sum-key">{t.common.discount}</td><td className="sum-val sum-expense">{formatMoney(summary.discounts, locale)}</td></tr>
            <tr><td className="sum-key">{t.reports.cogs}</td><td className="sum-val sum-expense">{formatMoney(summary.cogs, locale)}</td></tr>
            <tr className="sum-status"><td className="sum-key">{t.reports.netSales}</td><td className="sum-val">{formatMoney(summary.netSales, locale)}</td></tr>
            <tr><td className="sum-key">{t.reports.avgTicket}</td><td className="sum-val">{formatMoney(summary.avgTicket, locale)}</td></tr>
          </tbody>
        </table>
      </div>
    </ReportHeader>
  );
}

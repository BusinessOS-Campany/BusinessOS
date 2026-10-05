import type { Prisma, PrismaClient } from "@/core/db/generated/prisma/client";

/**
 * Reports v1. Every figure is derived from LEDGER tables (movements, invoice
 * lines with cost snapshots, cash movements) and every figure is aggregated by
 * the database — never in JavaScript — so report numbers reconcile exactly with
 * fixtures and cost stays flat as the tenant's data grows.
 *
 * Money is `bigint` minor units; quantities are `Decimal(18,3)`. The previous
 * implementation streamed whole tables into Node to sum them (every posted
 * invoice id, every line item, every stock level, every cash movement ever),
 * which made this endpoint slower the more the tenant sold. Each query below
 * returns a constant number of rows regardless of data volume.
 *
 * Rounding note: the old code did `(unitCost * qty_milli) / 1000n` per row and
 * summed the truncated results. `TRUNC(price * qty)` is the SQL equivalent of
 * that BigInt truncation, so totals match the previous output exactly.
 */

/** How many rows the low-stock and receivables lists return. */
const LIST_LIMIT = 100;

export class ReportsService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Sales totals per period from posted invoices. */
  async salesSummary(organizationId: string, from: Date, to: Date) {
    const agg = await this.prisma.salesInvoice.aggregate({
      where: { organizationId, status: "posted", issuedAt: { gte: from, lte: to } },
      _sum: { subtotal: true, taxTotal: true, discountTotal: true, total: true, paidTotal: true },
      _count: { _all: true },
    });
    return {
      invoices: agg._count._all,
      subtotal: agg._sum.subtotal ?? 0n,
      discountTotal: agg._sum.discountTotal ?? 0n,
      taxTotal: agg._sum.taxTotal ?? 0n,
      total: agg._sum.total ?? 0n,
      paidTotal: agg._sum.paidTotal ?? 0n,
    };
  }

  /**
   * Gross profit = Σ(lineSubtotal − unitCost·qty) over invoice items (ex-tax).
   *
   * One grouped query joining items to their invoice, replacing a full read of
   * the period's invoices followed by a full read of every line item on them.
   */
  async grossProfit(organizationId: string, from: Date, to: Date) {
    type Row = { revenue: bigint | null; cost: bigint | null };
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT
         COALESCE(SUM(sii.line_subtotal), 0)::bigint      AS revenue,
         COALESCE(SUM(TRUNC(sii.unit_cost * sii.qty)), 0)::bigint AS cost
       FROM sales_invoice_items sii
       JOIN sales_invoices si ON si.id = sii.invoice_id
       WHERE sii.organization_id = $1
         AND si.organization_id = $1
         AND si.status = 'posted'
         AND si.issued_at >= $2
         AND si.issued_at <= $3`,
      organizationId,
      from,
      to,
    );
    const revenue = rows[0]?.revenue ?? 0n;
    const cost = rows[0]?.cost ?? 0n;
    return { revenue, cost, profit: revenue - cost };
  }

  /**
   * Inventory valuation + low-stock list at current stock levels.
   *
   * Valuation and the per-product quantity rollup are aggregate queries; the
   * low-stock list is computed in SQL against a `HAVING`-style filter and
   * capped, instead of materialising every stock level and every product.
   * `lowStockTotal` carries the full count so callers can still show "N low".
   */
  async inventoryValuation(organizationId: string) {
    type ValRow = { cost_value: bigint | null; retail_value: bigint | null };
    const [val] = await this.prisma.$queryRawUnsafe<ValRow[]>(
      `SELECT
         COALESCE(SUM(TRUNC(p.cost_price * sl.qty)), 0)::bigint AS cost_value,
         COALESCE(SUM(TRUNC(p.sale_price * sl.qty)), 0)::bigint AS retail_value
       FROM stock_levels sl
       JOIN products p ON p.id = sl.product_id
       WHERE sl.organization_id = $1 AND p.organization_id = $1`,
      organizationId,
    );

    type LowRow = { sku: string; name_ar: string; qty: string; min_stock: string };
    const [lowCountRow] = await this.prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT COUNT(*)::bigint AS n FROM (
         SELECT sl.product_id
         FROM stock_levels sl
         JOIN products p ON p.id = sl.product_id
         WHERE sl.organization_id = $1 AND p.organization_id = $1
           AND p.min_stock IS NOT NULL
         GROUP BY sl.product_id, p.min_stock
         HAVING SUM(sl.qty) <= p.min_stock
       ) t`,
      organizationId,
    );
    const lowStockTotal = Number(lowCountRow?.n ?? 0n);

    const rows = await this.prisma.$queryRawUnsafe<LowRow[]>(
      `SELECT p.sku, p.name_ar, t.qty::text AS qty, p.min_stock::text AS min_stock
       FROM (
         SELECT sl.product_id, SUM(sl.qty) AS qty
         FROM stock_levels sl
         WHERE sl.organization_id = $1
         GROUP BY sl.product_id
       ) t
       JOIN products p ON p.id = t.product_id
       WHERE p.organization_id = $1
         AND p.min_stock IS NOT NULL
         AND t.qty <= p.min_stock
       ORDER BY t.qty ASC
       LIMIT $2`,
      organizationId,
      LIST_LIMIT,
    );

    const lowStock = rows.map((r) => ({
      sku: r.sku,
      nameAr: r.name_ar,
      qty: Number(r.qty),
      minStock: Number(r.min_stock),
    }));

    return {
      costValue: val?.cost_value ?? 0n,
      retailValue: val?.retail_value ?? 0n,
      lowStock,
      lowStockTotal,
    };
  }

  /**
   * Receivables: customers with outstanding balances (+ credit headroom).
   *
   * The total is an aggregate over the whole debtor population; the returned
   * list is the top `LIST_LIMIT` by balance so a tenant with thousands of open
   * accounts does not ship them all to a summary endpoint.
   */
  async debtReport(organizationId: string) {
    const [totalRow] = await this.prisma.$queryRawUnsafe<{ total: bigint | null; n: bigint }[]>(
      `SELECT COALESCE(SUM(balance), 0)::bigint AS total, COUNT(*)::bigint AS n
       FROM customers
       WHERE organization_id = $1 AND balance <> 0`,
      organizationId,
    );
    const customers = await this.prisma.customer.findMany({
      where: { organizationId, balance: { not: 0 } },
      select: { id: true, name: true, balance: true, creditLimit: true },
      orderBy: { balance: "desc" },
      take: LIST_LIMIT,
    });
    return {
      totalReceivable: totalRow?.total ?? 0n,
      customerCount: Number(totalRow?.n ?? 0n),
      customers,
      customersTruncated: (totalRow?.n ?? 0n) > BigInt(LIST_LIMIT),
    };
  }

  /**
   * Cashflow per account: movements grouped by reason for the period, plus
   * account balances as at `to`.
   *
   * Balances are a grouped aggregate rather than a full read of every movement
   * ever recorded for the tenant, which previously grew without bound.
   */
  async cashflow(
    organizationId: string,
    from: Date,
    to: Date,
    txHost?: Prisma.TransactionClient | PrismaClient,
  ) {
    const host = txHost ?? this.prisma;
    const movements = await host.cashMovement.groupBy({
      by: ["reason"],
      where: { organizationId, createdAt: { gte: from, lte: to } },
      _sum: { delta: true },
    });
    const accounts = await host.cashAccount.findMany({
      where: { organizationId },
      select: { id: true, nameAr: true, openingBalance: true },
    });
    const netByAccount = new Map<string, bigint>();
    for (const acc of accounts) netByAccount.set(acc.id, acc.openingBalance);

    const lifetime = await host.cashMovement.groupBy({
      by: ["accountId"],
      where: { organizationId, createdAt: { lte: to } },
      _sum: { delta: true },
    });
    for (const m of lifetime) {
      netByAccount.set(m.accountId, (netByAccount.get(m.accountId) ?? 0n) + (m._sum.delta ?? 0n));
    }

    const byReason = Object.fromEntries(movements.map((m) => [m.reason, m._sum.delta ?? 0n]));
    return {
      byReason,
      balances: Object.fromEntries(netByAccount),
      inflow: sumPositive(movements),
      outflow: sumNegative(movements),
    };
  }
}

function sumPositive(movements: Array<{ _sum: { delta: bigint | null } }>): bigint {
  let total = 0n;
  for (const m of movements) {
    const d = m._sum.delta ?? 0n;
    if (d > 0n) total += d;
  }
  return total;
}

function sumNegative(movements: Array<{ _sum: { delta: bigint | null } }>): bigint {
  let total = 0n;
  for (const m of movements) {
    const d = m._sum.delta ?? 0n;
    if (d < 0n) total += d;
  }
  return total;
}

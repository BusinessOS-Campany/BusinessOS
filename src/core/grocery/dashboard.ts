import { prisma } from "@/core/db/client";

export async function getDashboardKpis(organizationId: string) {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  const [
    todaySales,
    todayExpenses,
    lowStockProducts,
    customerDebts,
    totalProducts,
    activeCustomers,
  ] = await Promise.all([
    prisma.salesInvoice.aggregate({
      where: {
        organizationId,
        status: "posted",
        issuedAt: { gte: startOfDay, lt: endOfDay },
      },
      _sum: { total: true, paidTotal: true },
      _count: { _all: true },
    }),
    prisma.expense.aggregate({
      where: {
        organizationId,
        spentAt: { gte: startOfDay, lt: endOfDay },
      },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    getLowStockCount(organizationId),
    prisma.customer.aggregate({
      where: { organizationId, balance: { gt: 0 } },
      _sum: { balance: true },
      _count: { _all: true },
    }),
    prisma.product.count({
      where: { organizationId, isActive: true },
    }),
    prisma.customer.count({
      where: { organizationId, isActive: true },
    }),
  ]);

  const salesTotal = todaySales._sum.total ?? 0n;
  const salesPaid = todaySales._sum.paidTotal ?? 0n;
  const expensesTotal = todayExpenses._sum.amount ?? 0n;

  return {
    todaySales: {
      total: salesTotal,
      paid: salesPaid,
      count: todaySales._count._all,
    },
    todayExpenses: {
      total: expensesTotal,
      count: todayExpenses._count._all,
    },
    lowStock: {
      count: lowStockProducts,
    },
    debts: {
      total: customerDebts._sum.balance ?? 0n,
      count: customerDebts._count._all,
    },
    totalProducts,
    activeCustomers,
  };
}

export async function getSalesSeries(organizationId: string, days: number) {
  const from = new Date();
  from.setDate(from.getDate() - days);
  from.setHours(0, 0, 0, 0);

  const invoices = await prisma.salesInvoice.findMany({
    where: {
      organizationId,
      status: "posted",
      issuedAt: { gte: from },
    },
    select: {
      id: true,
      issuedAt: true,
      subtotal: true,
      total: true,
      paidTotal: true,
    },
    orderBy: { issuedAt: "asc" },
  });

  const dailyMap = new Map<
    string,
    { revenue: bigint; cost: bigint; count: number }
  >();

  for (const inv of invoices) {
    const day = inv.issuedAt.toISOString().slice(0, 10);
    const existing = dailyMap.get(day) ?? { revenue: 0n, cost: 0n, count: 0 };
    existing.revenue += inv.subtotal;
    existing.count += 1;
    dailyMap.set(day, existing);
  }

  const invoiceIds = invoices.map((i) => i.id);
  if (invoiceIds.length > 0) {
    const items = await prisma.salesInvoiceItem.findMany({
      where: {
        organizationId,
        invoiceId: { in: invoiceIds },
      },
      select: { invoiceId: true, qty: true, unitCost: true },
    });

    const costByInvoice = new Map<string, bigint>();
    for (const item of items) {
      const milli = BigInt(item.qty.toFixed(3).replace(".", ""));
      const cost = (item.unitCost * milli) / 1000n;
      costByInvoice.set(
        item.invoiceId,
        (costByInvoice.get(item.invoiceId) ?? 0n) + cost,
      );
    }

    const invoiceDateMap = new Map(
      invoices.map((inv) => [inv.id, inv.issuedAt.toISOString().slice(0, 10)]),
    );

    for (const [invId, cost] of costByInvoice) {
      const day = invoiceDateMap.get(invId);
      if (day && dailyMap.has(day)) {
        const entry = dailyMap.get(day)!;
        entry.cost += cost;
      }
    }
  }

  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const entry = dailyMap.get(key);
    series.push({
      date: key,
      revenue: entry?.revenue ?? 0n,
      cost: entry?.cost ?? 0n,
      profit: (entry?.revenue ?? 0n) - (entry?.cost ?? 0n),
      count: entry?.count ?? 0,
    });
  }

  return series;
}

export async function getSalesByCategory(organizationId: string, days: number) {
  const from = new Date();
  from.setDate(from.getDate() - days);
  from.setHours(0, 0, 0, 0);

  const recentInvoices = await prisma.salesInvoice.findMany({
    where: {
      organizationId,
      status: "posted",
      issuedAt: { gte: from },
    },
    select: { id: true },
  });

  const invoiceIds = recentInvoices.map((i) => i.id);
  if (invoiceIds.length === 0) return [];

  const items = await prisma.salesInvoiceItem.findMany({
    where: {
      organizationId,
      invoiceId: { in: invoiceIds },
    },
    select: {
      productId: true,
      lineSubtotal: true,
      qty: true,
      unitCost: true,
    },
  });

  if (items.length === 0) return [];

  const productIds = [...new Set(items.map((i) => i.productId))];
  const products = await prisma.product.findMany({
    where: { organizationId, id: { in: productIds } },
    select: { id: true, categoryId: true },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  const categoryMap = new Map<
    string,
    { revenue: bigint; cost: bigint; qty: number }
  >();

  for (const item of items) {
    const product = productMap.get(item.productId);
    const catId = product?.categoryId ?? "uncategorized";
    const entry = categoryMap.get(catId) ?? { revenue: 0n, cost: 0n, qty: 0 };
    entry.revenue += item.lineSubtotal;
    const milli = BigInt(item.qty.toFixed(3).replace(".", ""));
    entry.cost += (item.unitCost * milli) / 1000n;
    entry.qty += Number(item.qty);
    categoryMap.set(catId, entry);
  }

  const catIds = [...categoryMap.keys()].filter((id) => id !== "uncategorized");
  const categories = catIds.length
    ? await prisma.category.findMany({
        where: { organizationId, id: { in: catIds } },
        select: { id: true, nameAr: true },
      })
    : [];
  const catNameMap = new Map(categories.map((c) => [c.id, c.nameAr]));

  return [...categoryMap.entries()].map(([catId, data]) => ({
    categoryId: catId,
    categoryName: catNameMap.get(catId) ?? "Uncategorized",
    revenue: data.revenue,
    cost: data.cost,
    profit: data.revenue - data.cost,
    qty: data.qty,
  }));
}

export async function getTopProducts(
  organizationId: string,
  days: number,
  limit?: number,
) {
  const from = new Date();
  from.setDate(from.getDate() - days);
  from.setHours(0, 0, 0, 0);

  const recentInvoices = await prisma.salesInvoice.findMany({
    where: {
      organizationId,
      status: "posted",
      issuedAt: { gte: from },
    },
    select: { id: true },
  });

  const invoiceIds = recentInvoices.map((i) => i.id);
  if (invoiceIds.length === 0) return [];

  const items = await prisma.salesInvoiceItem.findMany({
    where: {
      organizationId,
      invoiceId: { in: invoiceIds },
    },
    select: {
      productId: true,
      lineSubtotal: true,
      qty: true,
    },
  });

  const aggMap = new Map<
    string,
    { revenue: bigint; qty: number; count: number }
  >();
  for (const item of items) {
    const entry = aggMap.get(item.productId) ?? { revenue: 0n, qty: 0, count: 0 };
    entry.revenue += item.lineSubtotal;
    entry.qty += Number(item.qty);
    entry.count += 1;
    aggMap.set(item.productId, entry);
  }

  const sorted = [...aggMap.entries()].sort(
    (a, b) => Number(b[1].revenue - a[1].revenue),
  );

  const topIds = sorted.slice(0, limit ?? 10).map(([id]) => id);
  if (topIds.length === 0) return [];

  const products = await prisma.product.findMany({
    where: { organizationId, id: { in: topIds } },
    select: { id: true, sku: true, nameAr: true, salePrice: true },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  return sorted.slice(0, limit ?? 10).map(([id, data]) => {
    const product = productMap.get(id);
    return {
      productId: id,
      sku: product?.sku ?? "N/A",
      nameAr: product?.nameAr ?? "N/A",
      salePrice: product?.salePrice ?? 0n,
      totalRevenue: data.revenue,
      totalQty: data.qty,
      saleCount: data.count,
    };
  });
}

export async function getRecentSales(organizationId: string, limit?: number) {
  const invoices = await prisma.salesInvoice.findMany({
    where: { organizationId, status: "posted" },
    orderBy: { issuedAt: "desc" },
    take: limit ?? 10,
    select: {
      id: true,
      number: true,
      total: true,
      paidTotal: true,
      issuedAt: true,
      customerId: true,
      notes: true,
    },
  });

  const customerIds = [
    ...new Set(invoices.map((i) => i.customerId).filter(Boolean)),
  ] as string[];
  const customers = customerIds.length
    ? await prisma.customer.findMany({
        where: { organizationId, id: { in: customerIds } },
        select: { id: true, name: true },
      })
    : [];
  const customerMap = new Map(customers.map((c) => [c.id, c.name]));

  return invoices.map((inv) => ({
    ...inv,
    customerName: inv.customerId ? customerMap.get(inv.customerId) ?? null : null,
  }));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getLowStockCount(organizationId: string): Promise<number> {
  const products = await prisma.product.findMany({
    where: {
      organizationId,
      isActive: true,
      trackStock: true,
      minStock: { not: null },
    },
    select: { id: true, minStock: true },
  });

  const ids = products.map((p) => p.id);
  if (ids.length === 0) return 0;

  // One grouped read per org instead of one query per product.
  const sums = await prisma.stockLevel.groupBy({
    by: ["productId"],
    where: { organizationId, productId: { in: ids } },
    _sum: { qty: true },
  });
  const qtyById = new Map(
    sums.map((s) => [s.productId, s._sum.qty ? Number(s._sum.qty) : 0]),
  );

  let count = 0;
  for (const product of products) {
    if (!product.minStock) continue;
    const totalQty = qtyById.get(product.id) ?? 0;
    if (totalQty <= Number(product.minStock)) count += 1;
  }

  return count;
}

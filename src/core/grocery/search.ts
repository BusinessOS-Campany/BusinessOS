import { prisma } from "@/core/db/client";

export interface SearchResult {
  group: string;
  items: Array<{
    id: string;
    title: string;
    subtitle?: string;
    href: string;
  }>;
}

export async function globalSearch(
  organizationId: string,
  query: string,
): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  const [
    products,
    customers,
    suppliers,
    invoices,
    purchases,
    expenses,
  ] = await Promise.all([
    prisma.product.findMany({
      where: {
        organizationId,
        isActive: true,
        OR: [
          { nameAr: { contains: q, mode: "insensitive" } },
          { nameEn: { contains: q, mode: "insensitive" } },
          { sku: { contains: q, mode: "insensitive" } },
          { barcode: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 5,
      select: { id: true, nameAr: true, sku: true, barcode: true },
    }),

    prisma.customer.findMany({
      where: {
        organizationId,
        isActive: true,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { phone: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 5,
      select: { id: true, name: true, phone: true },
    }),

    prisma.supplier.findMany({
      where: {
        organizationId,
        isActive: true,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { phone: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 5,
      select: { id: true, name: true, phone: true },
    }),

    prisma.salesInvoice.findMany({
      where: {
        organizationId,
        status: "posted",
        OR: [
          { number: { contains: q, mode: "insensitive" } },
          { notes: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 5,
      select: { id: true, number: true, total: true, issuedAt: true },
    }),

    prisma.purchase.findMany({
      where: {
        organizationId,
        OR: [
          { number: { contains: q, mode: "insensitive" } },
          { notes: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 5,
      select: { id: true, number: true, total: true, issuedAt: true },
    }),

    prisma.expense.findMany({
      where: {
        organizationId,
        OR: [
          { note: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 5,
      select: { id: true, amount: true, note: true, spentAt: true },
    }),
  ]);

  const results: SearchResult[] = [];

  if (products.length > 0) {
    results.push({
      group: "products",
      items: products.map((p) => ({
        id: p.id,
        title: p.nameAr,
        subtitle: `${p.sku}${p.barcode ? ` | ${p.barcode}` : ""}`,
        href: `/inventory/products/${p.id}`,
      })),
    });
  }

  if (customers.length > 0) {
    results.push({
      group: "customers",
      items: customers.map((c) => ({
        id: c.id,
        title: c.name,
        subtitle: c.phone ?? undefined,
        href: `/customers/${c.id}`,
      })),
    });
  }

  if (suppliers.length > 0) {
    results.push({
      group: "suppliers",
      items: suppliers.map((s) => ({
        id: s.id,
        title: s.name,
        subtitle: s.phone ?? undefined,
        href: `/suppliers/${s.id}`,
      })),
    });
  }

  if (invoices.length > 0) {
    results.push({
      group: "invoices",
      items: invoices.map((i) => ({
        id: i.id,
        title: i.number,
        subtitle: `${Number(i.total)} SAR - ${i.issuedAt.toISOString().slice(0, 10)}`,
        href: `/sales/invoices/${i.id}`,
      })),
    });
  }

  if (purchases.length > 0) {
    results.push({
      group: "purchases",
      items: purchases.map((p) => ({
        id: p.id,
        title: p.number,
        subtitle: `${Number(p.total)} SAR - ${p.issuedAt.toISOString().slice(0, 10)}`,
        href: `/purchases/${p.id}`,
      })),
    });
  }

  if (expenses.length > 0) {
    results.push({
      group: "expenses",
      items: expenses.map((e) => ({
        id: e.id,
        title: e.note ?? "Expense",
        subtitle: `${Number(e.amount)} SAR - ${e.spentAt.toISOString().slice(0, 10)}`,
        href: `/expenses/${e.id}`,
      })),
    });
  }

  return results;
}

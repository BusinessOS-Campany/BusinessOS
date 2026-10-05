import { ok, withRoute, ApiError } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { requireModule, requirePermission } from "@/core/db/tenant-guard";
import { getOrgSettings } from "@/core/tenancy/settings";
import { prisma } from "@/core/db/client";

type ReportType = "sales" | "purchases" | "profit" | "tax" | "customers" | "suppliers" | "expenses";

export const GET = withRoute("v1.grocery.reports.get", async (request) => {
  const { tenant } = await requireTenantContext(request);
  const settings = await getOrgSettings(tenant.organizationId);
  requireModule(settings, "reports");
  requirePermission(tenant, { reports: ["read"] });

  const url = new URL(request.url);
  const type = url.searchParams.get("type") as ReportType | null;
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");

  if (!type) throw ApiError.badRequest("type query param is required");
  if (!dateFrom) throw ApiError.badRequest("dateFrom query param is required");
  if (!dateTo) throw ApiError.badRequest("dateTo query param is required");

  const from = new Date(dateFrom);
  const to = new Date(dateTo);
  const orgId = tenant.organizationId;

  switch (type) {
    case "sales":
      return ok(await salesReport(orgId, from, to));
    case "purchases":
      return ok(await purchasesReport(orgId, from, to));
    case "profit":
      return ok(await profitReport(orgId, from, to));
    case "tax":
      return ok(await taxReport(orgId, from, to));
    case "customers":
      return ok(await customersReport(orgId, from, to));
    case "suppliers":
      return ok(await suppliersReport(orgId, from, to));
    case "expenses":
      return ok(await expensesReport(orgId, from, to));
    default:
      throw ApiError.badRequest(`Unknown report type: ${type}`);
  }
});

// ── Sales Report ──────────────────────────────────────────────────────────────

async function salesReport(organizationId: string, from: Date, to: Date) {
  const invoices = await prisma.salesInvoice.findMany({
    where: { organizationId, status: "posted", issuedAt: { gte: from, lte: to } },
    select: { total: true, paidTotal: true, issuedAt: true },
  });

  const total = invoices.reduce((sum, inv) => sum + Number(inv.total), 0);
  const count = invoices.length;

  const dayMap = new Map<string, { value: number; count: number }>();
  for (const inv of invoices) {
    const day = inv.issuedAt.toISOString().slice(0, 10);
    const entry = dayMap.get(day) ?? { value: 0, count: 0 };
    entry.value += Number(inv.total);
    entry.count += 1;
    dayMap.set(day, entry);
  }

  const rows = [...dayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, data]) => ({ label, value: data.value, count: data.count }));

  return {
    type: "sales" as const,
    title: "Sales Report",
    total,
    rows,
    chartData: rows.map((r) => ({ name: r.label, value: r.value })),
  };
}

// ── Purchases Report ──────────────────────────────────────────────────────────

async function purchasesReport(organizationId: string, from: Date, to: Date) {
  const purchases = await prisma.purchase.findMany({
    where: { organizationId, issuedAt: { gte: from, lte: to } },
    select: { total: true, issuedAt: true },
  });

  const total = purchases.reduce((sum, p) => sum + Number(p.total), 0);
  const count = purchases.length;

  const dayMap = new Map<string, { value: number; count: number }>();
  for (const p of purchases) {
    const day = p.issuedAt.toISOString().slice(0, 10);
    const entry = dayMap.get(day) ?? { value: 0, count: 0 };
    entry.value += Number(p.total);
    entry.count += 1;
    dayMap.set(day, entry);
  }

  const rows = [...dayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, data]) => ({ label, value: data.value, count: data.count }));

  return {
    type: "purchases" as const,
    title: "Purchases Report",
    total,
    rows,
    chartData: rows.map((r) => ({ name: r.label, value: r.value })),
  };
}

// ── Profit Report ─────────────────────────────────────────────────────────────

async function profitReport(organizationId: string, from: Date, to: Date) {
  const invoices = await prisma.salesInvoice.findMany({
    where: { organizationId, status: "posted", issuedAt: { gte: from, lte: to } },
    select: { id: true, subtotal: true, issuedAt: true },
  });

  const invoiceIds = invoices.map((i) => i.id);
  const [purchaseItems, expenses] = await Promise.all([
    invoiceIds.length
      ? prisma.salesInvoiceItem.findMany({
          where: { organizationId, invoiceId: { in: invoiceIds } },
          select: { qty: true, unitCost: true },
        })
      : [],
    prisma.expense.aggregate({
      where: { organizationId, spentAt: { gte: from, lte: to } },
      _sum: { amount: true },
    }),
  ]);

  const revenue = invoices.reduce((sum, inv) => sum + Number(inv.subtotal), 0);

  let cogs = 0;
  for (const item of purchaseItems) {
    const milli = BigInt(item.qty.toFixed(3).replace(".", ""));
    const cost = Number((item.unitCost * milli) / 1000n);
    cogs += cost;
  }

  const expensesTotal = Number(expenses._sum.amount ?? 0n);
  const total = revenue - cogs - expensesTotal;

  const dayMap = new Map<string, number>();
  for (const inv of invoices) {
    const day = inv.issuedAt.toISOString().slice(0, 10);
    dayMap.set(day, (dayMap.get(day) ?? 0) + Number(inv.subtotal));
  }

  const rows = [...dayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, value]) => ({ label, value, count: 1 }));

  return {
    type: "profit" as const,
    title: "Profit Report",
    total,
    rows,
    chartData: rows.map((r) => ({ name: r.label, value: r.value })),
  };
}

// ── Tax Report ────────────────────────────────────────────────────────────────

async function taxReport(organizationId: string, from: Date, to: Date) {
  const invoices = await prisma.salesInvoice.findMany({
    where: { organizationId, status: "posted", issuedAt: { gte: from, lte: to } },
    select: { taxTotal: true, issuedAt: true },
  });

  const total = invoices.reduce((sum, inv) => sum + Number(inv.taxTotal), 0);
  const count = invoices.length;

  const dayMap = new Map<string, { value: number; count: number }>();
  for (const inv of invoices) {
    const day = inv.issuedAt.toISOString().slice(0, 10);
    const entry = dayMap.get(day) ?? { value: 0, count: 0 };
    entry.value += Number(inv.taxTotal);
    entry.count += 1;
    dayMap.set(day, entry);
  }

  const rows = [...dayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, data]) => ({ label, value: data.value, count: data.count }));

  return {
    type: "tax" as const,
    title: "Tax Report",
    total,
    rows,
    chartData: rows.map((r) => ({ name: r.label, value: r.value })),
  };
}

// ── Customers Report ──────────────────────────────────────────────────────────

async function customersReport(organizationId: string, from: Date, to: Date) {
  const invoices = await prisma.salesInvoice.findMany({
    where: {
      organizationId,
      status: "posted",
      issuedAt: { gte: from, lte: to },
      customerId: { not: null },
    },
    select: { customerId: true, total: true },
  });

  const aggMap = new Map<string, { value: number; count: number }>();
  for (const inv of invoices) {
    const cid = inv.customerId!;
    const entry = aggMap.get(cid) ?? { value: 0, count: 0 };
    entry.value += Number(inv.total);
    entry.count += 1;
    aggMap.set(cid, entry);
  }

  const customerIds = [...aggMap.keys()];
  const customers = customerIds.length
    ? await prisma.customer.findMany({
        where: { organizationId, id: { in: customerIds } },
        select: { id: true, name: true },
      })
    : [];
  const customerMap = new Map(customers.map((c) => [c.id, c.name]));

  const total = [...aggMap.values()].reduce((sum, e) => sum + e.value, 0);

  const rows = [...aggMap.entries()]
    .sort(([, a], [, b]) => b.value - a.value)
    .map(([id, data]) => ({
      label: customerMap.get(id) ?? id,
      value: data.value,
      count: data.count,
    }));

  return {
    type: "customers" as const,
    title: "Customers Report",
    total,
    rows,
    chartData: rows.map((r) => ({ name: r.label, value: r.value })),
  };
}

// ── Suppliers Report ──────────────────────────────────────────────────────────

async function suppliersReport(organizationId: string, from: Date, to: Date) {
  const purchases = await prisma.purchase.findMany({
    where: {
      organizationId,
      issuedAt: { gte: from, lte: to },
      supplierId: { not: null },
    },
    select: { supplierId: true, total: true },
  });

  const aggMap = new Map<string, { value: number; count: number }>();
  for (const p of purchases) {
    const sid = p.supplierId!;
    const entry = aggMap.get(sid) ?? { value: 0, count: 0 };
    entry.value += Number(p.total);
    entry.count += 1;
    aggMap.set(sid, entry);
  }

  const supplierIds = [...aggMap.keys()];
  const suppliers = supplierIds.length
    ? await prisma.supplier.findMany({
        where: { organizationId, id: { in: supplierIds } },
        select: { id: true, name: true },
      })
    : [];
  const supplierMap = new Map(suppliers.map((s) => [s.id, s.name]));

  const total = [...aggMap.values()].reduce((sum, e) => sum + e.value, 0);

  const rows = [...aggMap.entries()]
    .sort(([, a], [, b]) => b.value - a.value)
    .map(([id, data]) => ({
      label: supplierMap.get(id) ?? id,
      value: data.value,
      count: data.count,
    }));

  return {
    type: "suppliers" as const,
    title: "Suppliers Report",
    total,
    rows,
    chartData: rows.map((r) => ({ name: r.label, value: r.value })),
  };
}

// ── Expenses Report ───────────────────────────────────────────────────────────

async function expensesReport(organizationId: string, from: Date, to: Date) {
  const expenses = await prisma.expense.findMany({
    where: { organizationId, spentAt: { gte: from, lte: to } },
    select: { categoryId: true, amount: true, spentAt: true },
  });

  const catIds = [...new Set(expenses.map((e) => e.categoryId).filter(Boolean))] as string[];
  const categories = catIds.length
    ? await prisma.expenseCategory.findMany({
        where: { organizationId, id: { in: catIds } },
        select: { id: true, nameAr: true },
      })
    : [];
  const catMap = new Map(categories.map((c) => [c.id, c.nameAr]));

  const aggMap = new Map<string, { value: number; count: number }>();
  for (const e of expenses) {
    const cid = e.categoryId ?? "uncategorized";
    const entry = aggMap.get(cid) ?? { value: 0, count: 0 };
    entry.value += Number(e.amount);
    entry.count += 1;
    aggMap.set(cid, entry);
  }

  const total = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

  const rows = [...aggMap.entries()]
    .sort(([, a], [, b]) => b.value - a.value)
    .map(([id, data]) => ({
      label: catMap.get(id) ?? (id === "uncategorized" ? "Uncategorized" : id),
      value: data.value,
      count: data.count,
    }));

  return {
    type: "expenses" as const,
    title: "Expenses Report",
    total,
    rows,
    chartData: rows.map((r) => ({ name: r.label, value: r.value })),
  };
}

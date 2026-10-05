import type { PrismaClient } from "@/core/db/generated/prisma/client";
import type { TenantRef } from "@/core/sales/service";
import type {
  GetSalesSummaryArgs,
  GetTopProductsArgs,
  GetDebtArgs,
  GetInventoryArgs,
  SearchArgs,
} from "./types";

/**
 * Execute a read tool against the DB. Returns the result immediately.
 * AI has zero direct SQL access — goes through these grounded executors only.
 */
export async function executeReadTool(
  tx: PrismaClient,
  tenant: TenantRef,
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const oid = tenant.organizationId;

  switch (toolName) {
    case "get_sales_summary": {
      const a = args as GetSalesSummaryArgs;
      const where: Record<string, unknown> = { organizationId: oid, status: "posted" };
      if (a.startDate || a.endDate) {
        const issuedAt: Record<string, Date> = {};
        if (a.startDate) issuedAt.gte = new Date(a.startDate);
        if (a.endDate) issuedAt.lte = new Date(a.endDate + "T23:59:59.999Z");
        where.issuedAt = issuedAt;
      }
      if (a.warehouseId) where.warehouseId = a.warehouseId;

      const result = await tx.salesInvoice.aggregate({
        where,
        _sum: { total: true, paidTotal: true },
        _count: true,
      });
      const totalRevenue = Number(result._sum.total ?? 0);
      const totalPaid = Number(result._sum.paidTotal ?? 0);
      const count = result._count;
      return {
        totalRevenue,
        totalPaid,
        totalOutstanding: totalRevenue - totalPaid,
        invoiceCount: count,
        averageOrderValue: count > 0 ? Math.round(totalRevenue / count) : 0,
        currency: "SAR",
      };
    }

    case "get_top_products": {
      const a = args as GetTopProductsArgs;
      // First get invoice IDs for this org
      const invoiceIds = await tx.salesInvoice.findMany({
        where: { organizationId: oid, status: "posted" },
        select: { id: true },
      });
      const ids = invoiceIds.map((i) => i.id);

      const items = ids.length ? await tx.salesInvoiceItem.groupBy({
        by: ["productId"],
        where: { invoiceId: { in: ids } },
        _sum: { lineTotal: true, qty: true },
        _count: true,
        orderBy: { _sum: { lineTotal: "desc" } },
        take: a.limit,
      }) : [];
      const productIds = items.map((i) => i.productId);
      const products = productIds.length
        ? await tx.product.findMany({ where: { id: { in: productIds } }, select: { id: true, nameAr: true, nameEn: true, sku: true } })
        : [];
      const productMap = new Map(products.map((p) => [p.id, p]));

      return items.map((i) => {
        const p = productMap.get(i.productId);
        return {
          productId: i.productId,
          name: p?.nameEn || p?.nameAr || i.productId,
          sku: p?.sku,
          totalRevenue: Number(i._sum?.lineTotal ?? 0),
          totalQty: Number(i._sum?.qty ?? 0),
          invoiceCount: i._count,
        };
      });
    }

    case "get_debt": {
      const a = args as GetDebtArgs;
      const where: Record<string, unknown> = { organizationId: oid, balance: { gt: 0 } };
      if (a.customerId) where.id = a.customerId;

      const customers = await tx.customer.findMany({
        where,
        select: { id: true, name: true, balance: true, creditLimit: true },
        orderBy: { balance: "desc" },
        take: a.limit,
      });
      return customers.map((c) => ({
        customerId: c.id,
        name: c.name,
        balance: Number(c.balance),
        creditLimit: Number(c.creditLimit),
        utilizationPct: c.creditLimit > 0n ? Math.round((Number(c.balance) / Number(c.creditLimit)) * 100) : 0,
      }));
    }

    case "get_inventory": {
      const a = args as GetInventoryArgs;
      const where: Record<string, unknown> = { organizationId: oid };
      if (a.warehouseId) where.warehouseId = a.warehouseId;

      const levels = await tx.stockLevel.findMany({
        where,
        select: { productId: true, warehouseId: true, qty: true },
        orderBy: { qty: "asc" },
        take: 200,
      });

      const productIds = [...new Set(levels.map((l) => l.productId))];
      const products = productIds.length
        ? await tx.product.findMany({ where: { id: { in: productIds } }, select: { id: true, nameAr: true, nameEn: true, sku: true, minStock: true } })
        : [];
      const productMap = new Map(products.map((p) => [p.id, p]));

      let result = levels.map((l) => {
        const p = productMap.get(l.productId);
        return {
          productId: l.productId,
          name: p?.nameEn || p?.nameAr || l.productId,
          sku: p?.sku,
          qty: Number(l.qty),
          minStock: p?.minStock ? Number(p.minStock) : null,
          isLow: p?.minStock ? Number(l.qty) <= Number(p.minStock) : false,
        };
      });

      if (a.lowOnly) result = result.filter((r) => r.isLow);
      return result;
    }

    case "search": {
      const a = args as SearchArgs;
      if (a.entity === "products") {
        const products = await tx.product.findMany({
          where: { organizationId: oid, isActive: true, nameAr: { contains: a.query, mode: "insensitive" } },
          select: { id: true, nameAr: true, nameEn: true, sku: true, salePrice: true },
          take: 20,
        });
        return products.map((p) => ({ id: p.id, name: p.nameEn || p.nameAr, sku: p.sku, salePrice: Number(p.salePrice) }));
      }
      if (a.entity === "customers") {
        const customers = await tx.customer.findMany({
          where: { organizationId: oid, name: { contains: a.query, mode: "insensitive" } },
          select: { id: true, name: true, phone: true, balance: true },
          take: 20,
        });
        return customers.map((c) => ({ id: c.id, name: c.name, phone: c.phone, balance: Number(c.balance) }));
      }
      // suppliers
      const suppliers = await tx.supplier.findMany({
        where: { organizationId: oid, name: { contains: a.query, mode: "insensitive" } },
        select: { id: true, name: true, phone: true },
        take: 20,
      });
      return suppliers.map((s) => ({ id: s.id, name: s.name, phone: s.phone }));
    }

    default:
      throw new Error(`Unknown read tool: ${toolName}`);
  }
}

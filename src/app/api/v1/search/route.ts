import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { requirePermission } from "@/core/db/tenant-guard";
import { prisma } from "@/core/db/client";

type SearchResult = {
  type: "product" | "customer" | "supplier" | "sale" | "purchase";
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

const LIMIT_PER_TYPE = 5;

export const GET = withRoute("v1.search", async (request) => {
  const { tenant } = await requireTenantContext(request);
  // Cross-resource search fans out over products, customers, suppliers, sales
  // and purchases at once, so it needs every one of those read permissions. A
  // role that can read products but not finance must not be able to use this to
  // enumerate sales it cannot otherwise see.
  requirePermission(tenant, {
    products: ["read"],
    customers: ["read"],
    suppliers: ["read"],
    sales: ["read"],
    purchases: ["read"],
  });
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();

  if (!q || q.length < 1) {
    return ok({ results: [] as SearchResult[], total: 0 });
  }

  const orgId = tenant.organizationId;

  const [products, customers, suppliers, sales, purchases] = await Promise.all([
    prisma.product.findMany({
      where: {
        organizationId: orgId,
        isActive: true,
        OR: [
          { nameAr: { contains: q, mode: "insensitive" } },
          { nameEn: { contains: q, mode: "insensitive" } },
          { sku: { contains: q, mode: "insensitive" } },
          { barcode: q },
        ],
      },
      select: { id: true, nameAr: true, nameEn: true, sku: true, barcode: true },
      take: LIMIT_PER_TYPE,
    }),
    prisma.customer.findMany({
      where: {
        organizationId: orgId,
        isActive: true,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { phone: { contains: q } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true, phone: true, email: true },
      take: LIMIT_PER_TYPE,
    }),
    prisma.supplier.findMany({
      where: {
        organizationId: orgId,
        isActive: true,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { phone: { contains: q } },
        ],
      },
      select: { id: true, name: true, phone: true },
      take: LIMIT_PER_TYPE,
    }),
    prisma.salesInvoice.findMany({
      where: {
        organizationId: orgId,
        OR: [{ number: { contains: q, mode: "insensitive" } }],
      },
      select: { id: true, number: true, total: true, issuedAt: true },
      take: LIMIT_PER_TYPE,
    }),
    prisma.purchase.findMany({
      where: {
        organizationId: orgId,
        OR: [{ number: { contains: q, mode: "insensitive" } }],
      },
      select: { id: true, number: true, total: true, issuedAt: true },
      take: LIMIT_PER_TYPE,
    }),
  ]);

  const productIds = products.map((p) => p.id);
  const stockMap = new Map<string, number>();
  if (productIds.length > 0) {
    const stockRows = await prisma.stockLevel.groupBy({
      by: ["productId"],
      where: { organizationId: orgId, productId: { in: productIds } },
      _sum: { qty: true },
    });
    for (const row of stockRows) {
      stockMap.set(row.productId, Number(row._sum.qty ?? 0));
    }
  }

  const results: SearchResult[] = [];

  for (const p of products) {
    const stock = stockMap.get(p.id);
    const subtitle = [
      p.sku,
      stock != null ? `Stock: ${stock}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    results.push({
      type: "product",
      id: p.id,
      title: p.nameAr || p.nameEn || p.sku,
      subtitle,
      href: `/products/${p.id}`,
    });
  }

  for (const c of customers) {
    results.push({
      type: "customer",
      id: c.id,
      title: c.name,
      subtitle: [c.phone, c.email].filter(Boolean).join(" · "),
      href: `/customers/${c.id}`,
    });
  }

  for (const s of suppliers) {
    results.push({
      type: "supplier",
      id: s.id,
      title: s.name,
      subtitle: s.phone ?? "",
      href: `/suppliers/${s.id}`,
    });
  }

  for (const inv of sales) {
    const date = inv.issuedAt.toLocaleDateString();
    results.push({
      type: "sale",
      id: inv.id,
      title: inv.number,
      subtitle: `${date} · ${inv.total}`,
      href: `/sales/${inv.id}`,
    });
  }

  for (const pur of purchases) {
    const date = pur.issuedAt.toLocaleDateString();
    results.push({
      type: "purchase",
      id: pur.id,
      title: pur.number,
      subtitle: `${date} · ${pur.total}`,
      href: `/purchases/${pur.id}`,
    });
  }

  return ok({ results, total: results.length });
});

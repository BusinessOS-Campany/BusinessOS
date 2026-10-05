import { z } from "zod";
import { ok, withRoute, ApiError } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { requireModule, requirePermission } from "@/core/db/tenant-guard";
import { getOrgSettings } from "@/core/tenancy/settings";
import { createSale } from "@/core/sales/service";
import { prisma } from "@/core/db/client";

export const GET = withRoute("v1.grocery.sales.list", async (request) => {
  const { tenant } = await requireTenantContext(request);
  const settings = await getOrgSettings(tenant.organizationId);
  requireModule(settings, "sales");
  requirePermission(tenant, { sales: ["read"] });

  const url = new URL(request.url);
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");
  const status = url.searchParams.get("status") ?? "posted";
  const page = Math.max(Number(url.searchParams.get("page") ?? 1), 1);
  const pageSize = Math.min(Number(url.searchParams.get("pageSize") ?? 20), 100);
  const skip = (page - 1) * pageSize;

  const where: Record<string, unknown> = {
    organizationId: tenant.organizationId,
    status,
  };
  if (dateFrom || dateTo) {
    where.issuedAt = {
      ...(dateFrom && { gte: new Date(dateFrom) }),
      ...(dateTo && { lte: new Date(dateTo) }),
    };
  }

  const [rows, total] = await Promise.all([
    prisma.salesInvoice.findMany({
      where,
      orderBy: { issuedAt: "desc" },
      skip,
      take: pageSize,
      select: {
        id: true,
        number: true,
        customerId: true,
        total: true,
        paidTotal: true,
        status: true,
        issuedAt: true,
        notes: true,
      },
    }),
    prisma.salesInvoice.count({ where }),
  ]);

  const customerIds = [...new Set(rows.map((r) => r.customerId).filter(Boolean))] as string[];
  const customers = customerIds.length
    ? await prisma.customer.findMany({
        where: { organizationId: tenant.organizationId, id: { in: customerIds } },
        select: { id: true, name: true },
      })
    : [];
  const customerMap = new Map(customers.map((c) => [c.id, c.name]));

  const items = rows.map((inv) => ({
    ...inv,
    customerName: inv.customerId ? customerMap.get(inv.customerId) ?? null : null,
  }));

  return ok({ items, total });
});

const posSaleSchema = z.object({
  customerId: z.string().min(1).nullable().optional(),
  paymentMethod: z.enum(["cash", "card", "transfer", "credit"]).default("cash"),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().positive(),
        unitPrice: z.number().int().min(0).optional(),
      }),
    )
    .min(1)
    .max(200),
  total: z.number().int().min(0),
  paidAmount: z.number().int().min(0).optional(),
  warehouseId: z.string().min(1).optional(),
  notes: z.string().max(1000).optional(),
});

export const POST = withRoute("v1.grocery.sales.create", async (request) => {
  const { tenant } = await requireTenantContext(request);
  const settings = await getOrgSettings(tenant.organizationId);
  requireModule(settings, "sales");
  requirePermission(tenant, { sales: ["create"] });

  const body = posSaleSchema.parse(await request.json().catch(() => null));

  const defaultWarehouse = await prisma.warehouse.findFirst({
    where: { organizationId: tenant.organizationId, isMain: true },
    select: { id: true },
  });
  const warehouseId = body.warehouseId ?? defaultWarehouse?.id;
  if (!warehouseId) throw ApiError.badRequest("No warehouse found. Provide warehouseId.");

  const cashPaid = body.paidAmount ?? body.total;

  const result = await createSale(prisma, tenant, {
    customerId: body.customerId ?? undefined,
    warehouseId,
    items: body.items.map((item) => ({
      productId: item.productId,
      qty: item.quantity,
      unitPrice: item.unitPrice,
    })),
    cashPaid,
    notes: body.notes,
  });

  return ok({ invoiceNo: result.number }, { status: 201 });
});

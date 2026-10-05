import { z } from "zod";
import { ok, withRoute, ApiError } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { requireModule, requirePermission } from "@/core/db/tenant-guard";
import { getOrgSettings } from "@/core/tenancy/settings";
import { prisma } from "@/core/db/client";
import { generateReceipt } from "@/core/pos/receipt";
import type { ReceiptData, ReceiptBranding, ReceiptWidth } from "@/core/pos/types";

const receiptRequestSchema = z.object({
  invoiceId: z.string().min(1),
  width: z.enum(["58mm", "80mm", "a4"]).default("80mm"),
  rtl: z.boolean().default(false),
});

export const POST = withRoute("v1.pos.receipt", async (request) => {
  const { tenant } = await requireTenantContext(request);
  const settings = await getOrgSettings(tenant.organizationId);
  requireModule(settings, "sales");
  requirePermission(tenant, { sales: ["read"] });
  const body = receiptRequestSchema.parse(await request.json().catch(() => null));

  const invoice = await prisma.salesInvoice.findFirst({
    where: { id: body.invoiceId, organizationId: tenant.organizationId },
    select: {
      id: true,
      number: true,
      issuedAt: true,
      subtotal: true,
      discountTotal: true,
      taxTotal: true,
      total: true,
      paidTotal: true,
      customerId: true,
    },
  });
  if (!invoice) throw ApiError.notFound("Invoice not found");

  const customer = invoice.customerId
    ? await prisma.customer.findUnique({ where: { id: invoice.customerId }, select: { name: true } })
    : null;

  const items = await prisma.salesInvoiceItem.findMany({
    where: { invoiceId: invoice.id, organizationId: tenant.organizationId },
    select: { productId: true, qty: true, unitPrice: true, discount: true, lineTotal: true },
  });

  const productIds = [...new Set(items.map((i) => i.productId))];
  const products = productIds.length
    ? await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, nameAr: true, nameEn: true } })
    : [];
  const productMap = new Map(products.map((p) => [p.id, p]));

  const b = settings.branding;
  const branding: ReceiptBranding = {
    orgNameAr: (settings as Record<string, unknown>).orgNameAr as string || "Business",
    orgNameEn: (settings as Record<string, unknown>).orgNameEn as string || "Business",
    logoDataUrl: b?.logoUrl,
    primaryColor: b?.primary || "#1e40af",
    secondaryColor: b?.accent || "#3b82f6",
    accentColor: b?.accent || "#2563eb",
  };

  const receiptData: ReceiptData = {
    number: invoice.number,
    issuedAt: invoice.issuedAt.toISOString(),
    items: items.map((i) => {
      const prod = productMap.get(i.productId);
      return {
        name: body.rtl ? (prod?.nameAr || prod?.nameEn || i.productId) : (prod?.nameEn || prod?.nameAr || i.productId),
        qty: Number(i.qty),
        unitPrice: Number(i.unitPrice),
        discount: Number(i.discount),
        lineTotal: Number(i.lineTotal),
      };
    }),
    subtotal: Number(invoice.subtotal),
    discountTotal: Number(invoice.discountTotal),
    taxTotal: Number(invoice.taxTotal),
    total: Number(invoice.total),
    cashPaid: Number(invoice.paidTotal),
    creditPortion: Number(invoice.total) - Number(invoice.paidTotal),
    customerName: customer?.name ?? undefined,
  };

  const template = generateReceipt(receiptData, branding, body.width as ReceiptWidth, body.rtl);
  return ok(template);
});

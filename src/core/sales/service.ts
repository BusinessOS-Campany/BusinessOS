import { z } from "zod";
import type { Prisma, PrismaClient } from "@/core/db/generated/prisma/client";
import { ApiError } from "@/core/http/api";
import { applyStockMovement } from "@/core/inventory/service";
import { nextNumber } from "@/core/seq/service";
import { bpsOf, mulPriceQty, qtyToMilli } from "@/core/modules/money";
import { writeAuditLog } from "@/core/audit/service";
import { emitOutboxEvent, buildDedupeKey } from "@/core/workflows/bus";

export const saleItemSchema = z.object({
  productId: z.string().min(1),
  qty: z.number().positive().max(1_000_000),
  unitPrice: z.number().int().min(0).optional(), // override; default = product.salePrice
  discount: z.number().int().min(0).optional(), // line discount, minor units
});

export const saleSchema = z.object({
  customerId: z.string().min(1).nullable().optional(),
  warehouseId: z.string().min(1),
  items: z.array(saleItemSchema).min(1).max(200),
  /** Cash portion paid now (minor units). total - cashPaid = credit portion. */
  cashPaid: z.number().int().min(0),
  cashAccountId: z.string().min(1).nullable().optional(),
  notes: z.string().max(1000).optional(),
});

export type SaleInput = z.infer<typeof saleSchema>;

export interface TenantRef {
  organizationId: string;
  userId?: string;
}

/**
 * THE atomic sale. Inside ONE transaction:
 *   number allocation → invoice + items → payments → stock movements →
 *   cash movement → customer ledger → audit row.
 *
 * Any failure (insufficient stock, credit breach, injected fault) rolls back
 * everything — verifiable-goal M4.1. Totals are computed SERVER-SIDE from DB
 * prices; client-sent prices are treated as overrides but re-validated ≥ 0.
 */
export async function createSale(
  txHost: PrismaClient | Prisma.TransactionClient,
  tenant: TenantRef,
  input: SaleInput,
): Promise<{ invoiceId: string; number: string; total: bigint; creditPortion: bigint }> {
  return txHost.$transaction(async (tx) => {
    // ── resolve org-scoped references ──────────────────────────────────────
    const customer = input.customerId
      ? await tx.customer.findFirst({
          where: { id: input.customerId, organizationId: tenant.organizationId },
        })
      : null;
    if (input.customerId && !customer) throw ApiError.notFound("Customer not found");

    const warehouse = await tx.warehouse.findFirst({
      where: { id: input.warehouseId, organizationId: tenant.organizationId },
    });
    if (!warehouse) throw ApiError.notFound("Warehouse not found");

    if ((input.cashPaid ?? 0) > 0 && !input.cashAccountId) {
      throw ApiError.badRequest("cashAccountId is required when cashPaid > 0");
    }
    if (input.cashPaid === undefined) input.cashPaid = 0;
    const cashAccount = input.cashAccountId
      ? await tx.cashAccount.findFirst({
          where: { id: input.cashAccountId, organizationId: tenant.organizationId },
        })
      : null;
    if (input.cashAccountId && !cashAccount) throw ApiError.notFound("Cash account not found");

    // ── price resolution + server-side totals (bigint fixed-point) ────────
    let subtotal = 0n;
    let taxTotal = 0n;
    let discountTotal = 0n;

    // Batch-fetch all products upfront to avoid N+1 (one query instead of N)
    const productIds = [...new Set(input.items.map((i) => i.productId))];
    const products = await tx.product.findMany({
      where: { id: { in: productIds }, organizationId: tenant.organizationId },
      select: {
        id: true, sku: true, isActive: true, salePrice: true, costPrice: true, taxRateBps: true,
      },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    const pricedItems = [];
    for (const item of input.items) {
      const product = productMap.get(item.productId);
      if (!product || !product.isActive) {
        throw ApiError.badRequest(`Product unavailable: ${item.productId}`);
      }

      const unitPrice = BigInt(item.unitPrice ?? Number(product.salePrice));
      const qtyMilli = qtyToMilli(item.qty);
      const gross = mulPriceQty(unitPrice, qtyMilli);
      const discount = BigInt(item.discount ?? 0);
      if (discount > gross) throw ApiError.badRequest(`Line discount exceeds line amount (${product.sku})`);
      const net = gross - discount;
      const tax = bpsOf(net, product.taxRateBps);

      subtotal += net;
      discountTotal += discount;
      taxTotal += tax;

      pricedItems.push({
        productId: product.id,
        sku: product.sku,
        qtyMilli,
        unitPrice,
        discount,
        taxRateBps: product.taxRateBps,
        lineSubtotal: net,
        lineTax: tax,
        lineTotal: net + tax,
        unitCost: product.costPrice,
      });
    }
    const total = subtotal + taxTotal;
    const cashPaid = BigInt(input.cashPaid);
    if (cashPaid > total) throw ApiError.badRequest("Cash paid exceeds invoice total");
    const creditPortion = total - cashPaid;

    // ── credit-limit gate (M6 workflow-hook seam) ─────────────────────────
    if (creditPortion > 0n) {
      if (!customer) throw ApiError.badRequest("Credit sale requires a customer");
      await assertCreditAvailable(tx, customer.id, creditPortion);
    }

    // ── document number + invoice header/items ────────────────────────────
    const number = await nextNumber(tx, tenant.organizationId, "sales_invoice");
    const invoice = await tx.salesInvoice.create({
      data: {
        organizationId: tenant.organizationId,
        number,
        customerId: customer?.id,
        warehouseId: warehouse.id,
        subtotal,
        discountTotal,
        taxTotal,
        total,
        paidTotal: cashPaid,
        notes: input.notes,
        createdByUserId: tenant.userId,
      },
      select: { id: true },
    });
    // Plain FK columns (no relation) → items are separate inserts in the tx.
    await tx.salesInvoiceItem.createMany({
      data: pricedItems.map((p) => ({
        invoiceId: invoice.id,
        organizationId: tenant.organizationId,
        productId: p.productId,
        qty: Number(p.qtyMilli) / 1000,
        unitPrice: p.unitPrice,
        discount: p.discount,
        taxRateBps: p.taxRateBps,
        lineSubtotal: p.lineSubtotal,
        lineTax: p.lineTax,
        lineTotal: p.lineTotal,
        unitCost: p.unitCost,
      })),
    });

    // ── payment + cash movement ───────────────────────────────────────────
    if (cashPaid > 0n && cashAccount) {
      await tx.payment.create({
        data: {
          organizationId: tenant.organizationId,
          invoiceId: invoice.id,
          method: "cash",
          amount: cashPaid,
          cashAccountId: cashAccount.id,
          createdByUserId: tenant.userId,
        },
      });
      await tx.cashMovement.create({
        data: {
          organizationId: tenant.organizationId,
          accountId: cashAccount.id,
          delta: cashPaid,
          reason: "sale_payment",
          refType: "sales_invoice",
          refId: invoice.id,
          createdByUserId: tenant.userId,
        },
      });
    }

    // ── stock movements (ledger is the only writer of stock levels) ───────
    for (const p of pricedItems) {
      await applyStockMovement(tx, tenant, {
        productId: p.productId,
        warehouseId: warehouse.id,
        qtyDelta: -Number(p.qtyMilli) / 1000,
        reason: "sale",
        refType: "sales_invoice",
        refId: invoice.id,
      });
    }

    // ── customer receivable ledger ────────────────────────────────────────
    if (customer && creditPortion > 0n) {
      await tx.customer.update({
        where: { id: customer.id },
        data: { balance: { increment: creditPortion } },
      });
    }

    // ── audit (same tx — atomic with the business change) ─────────────────
    await writeAuditLog(tx, { organizationId: tenant.organizationId }, {
      action: "sale.created",
      entityType: "sales_invoice",
      entityId: invoice.id,
      after: { number, total: total.toString(), cashPaid: cashPaid.toString(), items: pricedItems.length },
    });

    // ── outbox event (same tx — rolls back with the sale, no orphans) ─────
    await emitOutboxEvent(tx, {
      organizationId: tenant.organizationId,
      eventType: "sale.created",
      dedupeKey: buildDedupeKey(tenant.organizationId, "sale.created", invoice.id),
      entityId: invoice.id,
      payload: {
        eventType: "sale.created",
        invoiceId: invoice.id,
        number,
        total: Number(total),
        cashPaid: Number(cashPaid),
        creditPortion: Number(creditPortion),
        customerId: customer?.id,
        warehouseId: warehouse.id,
        items: pricedItems.length,
        createdByUserId: tenant.userId,
      },
    });

    return { invoiceId: invoice.id, number, total, creditPortion };
  });
}

/**
 * Credit gate. Deliberately a standalone function so M6 workflows can wrap it
 * with notification/approval actions without touching the sale pipeline.
 */
export async function assertCreditAvailable(
  tx: Prisma.TransactionClient | PrismaClient,
  customerId: string,
  additionalCredit: bigint,
): Promise<void> {
  const c = await tx.customer.findUniqueOrThrow({
    where: { id: customerId },
    select: { name: true, balance: true, creditLimit: true },
  });
  if (c.creditLimit <= 0n) {
    throw new ApiError(
      422,
      "CREDIT_NOT_ALLOWED",
      `العميل ${c.name} غير مسموح له بالآجل`,
      `Customer ${c.name} is not allowed credit purchases`,
    );
  }
  if (c.balance + additionalCredit > c.creditLimit) {
    throw new ApiError(
      422,
      "CREDIT_LIMIT_EXCEEDED",
      `تجاوز حد الآجل للعميل ${c.name}`,
      `Credit limit exceeded for customer ${c.name}`,
      { balance: c.balance.toString(), creditLimit: c.creditLimit.toString() },
    );
  }
}

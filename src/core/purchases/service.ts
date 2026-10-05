import { z } from "zod";
import type { PrismaClient } from "@/core/db/generated/prisma/client";
import { ApiError } from "@/core/http/api";
import { applyStockMovement } from "@/core/inventory/service";
import { nextNumber } from "@/core/seq/service";
import { bpsOf, mulPriceQty, qtyToMilli } from "@/core/modules/money";
import { writeAuditLog } from "@/core/audit/service";

const purchaseItemSchema = z.object({
  productId: z.string().min(1),
  qty: z.number().positive().max(1_000_000),
  unitCost: z.number().int().min(0), // minor units, pre-tax
  taxRateBps: z.number().int().min(0).max(10000).optional(),
});

export const purchaseSchema = z.object({
  supplierId: z.string().min(1).nullable().optional(),
  warehouseId: z.string().min(1),
  items: z.array(purchaseItemSchema).min(1).max(200),
  cashPaid: z.number().int().min(0),
  cashAccountId: z.string().min(1).nullable().optional(),
  /** When true (default) received items also update product cost price to latest. */
  updateCost: z.boolean().optional(),
  notes: z.string().max(1000).optional(),
});

export type PurchaseInput = z.infer<typeof purchaseSchema>;

export interface TenantRef {
  organizationId: string;
  userId?: string;
}

/**
 * Atomic purchase receipt: number → purchase + items → stock IN movements →
 * cash out movement → supplier payable ledger → audit. Same rollback
 * guarantees as the sale pipeline.
 */
export async function createPurchase(
  prisma: PrismaClient,
  tenant: TenantRef,
  input: PurchaseInput,
): Promise<{ purchaseId: string; number: string; total: bigint; creditPortion: bigint }> {
  return prisma.$transaction(async (tx) => {
    const supplier = input.supplierId
      ? await tx.supplier.findFirst({
          where: { id: input.supplierId, organizationId: tenant.organizationId },
        })
      : null;
    if (input.supplierId && !supplier) throw ApiError.notFound("Supplier not found");

    const warehouse = await tx.warehouse.findFirst({
      where: { id: input.warehouseId, organizationId: tenant.organizationId },
    });
    if (!warehouse) throw ApiError.notFound("Warehouse not found");

    if (input.cashPaid === undefined) input.cashPaid = 0;
    if (input.cashPaid > 0 && !input.cashAccountId) {
      throw ApiError.badRequest("cashAccountId is required when cashPaid > 0");
    }
    const cashAccount = input.cashAccountId
      ? await tx.cashAccount.findFirst({
          where: { id: input.cashAccountId, organizationId: tenant.organizationId },
        })
      : null;
    if (input.cashAccountId && !cashAccount) throw ApiError.notFound("Cash account not found");

    let subtotal = 0n;
    let taxTotal = 0n;
    const lines = [];

    // Batch-fetch all products upfront to avoid N+1 (one query instead of N)
    const productIds = [...new Set(input.items.map((i) => i.productId))];
    const products = await tx.product.findMany({
      where: { id: { in: productIds }, organizationId: tenant.organizationId },
      select: { id: true, sku: true, isActive: true },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    for (const item of input.items) {
      const product = productMap.get(item.productId);
      if (!product || !product.isActive) {
        throw ApiError.badRequest(`Product unavailable: ${item.productId}`);
      }
      const cost = BigInt(item.unitCost);
      const taxRateBps = item.taxRateBps ?? 0;
      const lineSubtotal = mulPriceQty(cost, qtyToMilli(item.qty));
      const lineTax = bpsOf(lineSubtotal, taxRateBps);
      subtotal += lineSubtotal;
      taxTotal += lineTax;
      lines.push({ ...item, productId: product.id, sku: product.sku, cost, taxRateBps, lineSubtotal, lineTax });
    }
    const total = subtotal + taxTotal;
    const cashPaid = BigInt(input.cashPaid);
    if (cashPaid > total) throw ApiError.badRequest("Cash paid exceeds purchase total");
    const creditPortion = total - cashPaid;
    // An unpaid remainder must be owed to someone traceable.
    if (creditPortion > 0n && !supplier) {
      throw ApiError.badRequest("Unpaid remainder requires a supplier for the payable ledger");
    }

    const number = await nextNumber(tx, tenant.organizationId, "purchase");
    const purchase = await tx.purchase.create({
      data: {
        organizationId: tenant.organizationId,
        number,
        supplierId: supplier?.id,
        warehouseId: warehouse.id,
        status: "received",
        receivedAt: new Date(),
        subtotal,
        taxTotal,
        total,
        paidTotal: cashPaid,
        notes: input.notes,
        createdByUserId: tenant.userId,
      },
      select: { id: true },
    });
    await tx.purchaseItem.createMany({
      data: lines.map((l) => ({
        purchaseId: purchase.id,
        organizationId: tenant.organizationId,
        productId: l.productId,
        qty: l.qty,
        unitCost: l.cost,
        taxRateBps: l.taxRateBps,
        lineTotal: l.lineSubtotal + l.lineTax,
      })),
    });

    for (const l of lines) {
      await applyStockMovement(tx, tenant, {
        productId: l.productId,
        warehouseId: warehouse.id,
        qtyDelta: l.qty,
        reason: "purchase",
        refType: "purchase",
        refId: purchase.id,
      });
      if (input.updateCost !== false && l.cost > 0n) {
        // Last-cost bookkeeping: keep product cost aligned with latest receipt.
        await tx.product.update({
          where: { id: l.productId },
          data: { costPrice: l.cost },
        });
      }
    }

    if (cashPaid > 0n && cashAccount) {
      await tx.cashMovement.create({
        data: {
          organizationId: tenant.organizationId,
          accountId: cashAccount.id,
          delta: -cashPaid,
          reason: "purchase_payment",
          refType: "purchase",
          refId: purchase.id,
          createdByUserId: tenant.userId,
        },
      });
    }

    if (supplier && creditPortion > 0n) {
      await tx.supplier.update({
        where: { id: supplier.id },
        data: { balance: { increment: creditPortion } },
      });
    }

    await writeAuditLog(tx, { organizationId: tenant.organizationId }, {
      action: "purchase.received",
      entityType: "purchase",
      entityId: purchase.id,
      after: { number, total: total.toString(), items: lines.length },
    });

    return { purchaseId: purchase.id, number, total, creditPortion };
  });
}

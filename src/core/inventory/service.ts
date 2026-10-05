import type { Prisma, PrismaClient } from "@/core/db/generated/prisma/client";
import { ApiError } from "@/core/http/api";
import { getOrgSettings, isModuleEnabled, type OrgSettings } from "@/core/tenancy/settings";
import { milliToQty, qtyToMilli } from "@/core/modules/money";
import { emitOutboxEvent, buildDedupeKey } from "@/core/workflows/bus";

export interface TenantRef {
  organizationId: string;
  userId?: string;
}

export type MovementReason =
  | "sale"
  | "sale_return"
  | "purchase"
  | "adjustment"
  | "transfer_out"
  | "transfer_in";

export interface MovementInput {
  productId: string;
  warehouseId: string;
  /** Positive = stock in, negative = stock out (already signed). */
  qtyDelta: number | string;
  reason: MovementReason;
  refType?: string;
  refId?: string;
  note?: string;
}

/**
 * Applies one signed quantity change: appends the ledger row and upserts the
 * stock level ATOMICALLY inside the caller's tx. The ledger-sum==stock-level
 * invariant holds because both writes share this code path — no exceptions.
 *
 * Negative-resulting stock is rejected unless org settings allow it
 * (settings.allowNegativeStock). This is also an M6 workflow trigger seam.
 */
export async function applyStockMovement(
  tx: Prisma.TransactionClient,
  tenant: TenantRef,
  input: MovementInput,
): Promise<void> {
  const milli = qtyToMilli(input.qtyDelta);
  if (milli === 0n) {
    throw ApiError.badRequest("Quantity must be non-zero");
  }

  // Product must exist in THIS org; trackStock products move stock.
  const product = await tx.product.findFirst({
    where: { id: input.productId, organizationId: tenant.organizationId },
    select: { id: true, sku: true, trackStock: true, isActive: true, minStock: true },
  });
  if (!product) throw ApiError.notFound(`Product ${input.productId} not found`);
  if (!product.trackStock) return; // service-type products skip the ledger

  const settings = await getOrgSettings(tenant.organizationId);
  if (!isModuleEnabled(settings as OrgSettings, "inventory")) {
    throw new ApiError(404, "MODULE_DISABLED", "هذه الوحدة غير مفعّلة", "This module is not enabled");
  }

  const current = await tx.stockLevel.findUnique({
    where: { productId_warehouseId: { productId: product.id, warehouseId: input.warehouseId } },
    select: { id: true, qty: true },
  });

  const currentMilli = current ? qtyToMilli(current.qty.toString()) : 0n;
  const nextMilli = currentMilli + milli;

  if (nextMilli < 0n && !settings.allowNegativeStock) {
    throw new ApiError(
      409,
      "INSUFFICIENT_STOCK",
      `المخزون غير كافٍ للمنتج ${product.sku}`,
      `Insufficient stock for product ${product.sku}`,
    );
  }

  await tx.stockMovement.create({
    data: {
      organizationId: tenant.organizationId,
      productId: product.id,
      warehouseId: input.warehouseId,
      qtyDelta: milliToQty(milli),
      reason: input.reason,
      refType: input.refType,
      refId: input.refId,
      note: input.note,
      createdByUserId: tenant.userId,
    },
  });

  if (current) {
    await tx.stockLevel.update({ where: { id: current.id }, data: { qty: milliToQty(nextMilli) } });
  } else {
    await tx.stockLevel.create({
      data: {
        organizationId: tenant.organizationId,
        productId: product.id,
        warehouseId: input.warehouseId,
        qty: milliToQty(nextMilli),
      },
    });
  }

  // ── inventory.low outbox event (same tx — rolls back if movement rolls back) ──
  const newQty = Number(nextMilli) / 1000;
  const minStock = product.minStock ? Number(product.minStock) : null;
  if (minStock !== null && newQty <= minStock && newQty >= 0) {
    await emitOutboxEvent(tx, {
      organizationId: tenant.organizationId,
      eventType: "inventory.low",
      dedupeKey: buildDedupeKey(tenant.organizationId, "inventory.low", product.id),
      entityId: product.id,
      payload: {
        eventType: "inventory.low",
        productId: product.id,
        sku: product.sku,
        warehouseId: input.warehouseId,
        currentQty: newQty,
        minStock,
      },
    });
  }
}

/** Ledger-sum == stock-level invariant probe (used by tests + reports). */
export async function ledgerSum(
  tx: Prisma.TransactionClient | PrismaClient,
  organizationId: string,
  productId: string,
  warehouseId: string,
): Promise<number> {
  const agg = await tx.stockMovement.aggregate({
    where: { organizationId, productId, warehouseId },
    _sum: { qtyDelta: true },
  });
  return Number(agg._sum.qtyDelta ?? 0);
}

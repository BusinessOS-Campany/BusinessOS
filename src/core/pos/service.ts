import type { PrismaClient } from "@/core/db/generated/prisma/client";
import { ApiError } from "@/core/http/api";
import { createSale, type SaleInput, type TenantRef } from "@/core/sales/service";
import type { PosHoldInput } from "./types";

/**
 * Hold a POS cart. Persists the entire cart state in pos_holds so it can be
 * resumed later (even offline → sync once online).
 */
export async function holdCart(
  tx: PrismaClient,
  tenant: TenantRef,
  input: PosHoldInput,
) {
  const hold = await tx.posHold.create({
    data: {
      organizationId: tenant.organizationId,
      warehouseId: input.warehouseId,
      customerId: input.customerId ?? null,
      cashAccountId: input.cashAccountId ?? null,
      cart: {
        items: input.items,
        notes: input.notes,
        discountTotal: input.discountTotal,
      },
      label: input.label ?? null,
      createdByUserId: tenant.userId,
    },
    select: { id: true, createdAt: true },
  });
  return { holdId: hold.id, createdAt: hold.createdAt };
}

/**
 * List all active holds for the current org.
 */
export async function listHolds(tx: PrismaClient, tenant: TenantRef) {
  const holds = await tx.posHold.findMany({
    where: { organizationId: tenant.organizationId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      label: true,
      customerId: true,
      warehouseId: true,
      cart: true,
      createdAt: true,
    },
  });
  return holds.map((h) => ({
    holdId: h.id,
    label: h.label,
    customerId: h.customerId,
    warehouseId: h.warehouseId,
    cart: typeof h.cart === "string" ? JSON.parse(h.cart) : h.cart,
    createdAt: h.createdAt,
  }));
}

/**
 * Resume a held cart — returns the cart payload and deletes the hold.
 */
export async function resumeCart(
  tx: PrismaClient,
  tenant: TenantRef,
  holdId: string,
) {
  const hold = await tx.posHold.findFirst({
    where: { id: holdId, organizationId: tenant.organizationId },
  });
  if (!hold) throw ApiError.notFound("Hold not found");

  const cart = typeof hold.cart === "string" ? JSON.parse(hold.cart) : hold.cart;
  await tx.posHold.delete({ where: { id: holdId } });

  return {
    holdId: hold.id,
    warehouseId: hold.warehouseId,
    customerId: hold.customerId,
    cashAccountId: hold.cashAccountId,
    label: hold.label,
    cart,
  };
}

/**
 * Pay from a held cart — resumes the hold, creates the sale, returns receipt data.
 * This is the bridge between POS hold/resume and the atomic M4 createSale.
 */
export async function payFromHold(
  tx: PrismaClient,
  tenant: TenantRef,
  holdId: string,
  cashPaid: number,
  cashAccountId?: string | null,
) {
  const resume = await resumeCart(tx, tenant, holdId);

  const saleInput: SaleInput = {
    warehouseId: resume.warehouseId,
    customerId: resume.customerId,
    cashAccountId: cashAccountId ?? resume.cashAccountId,
    items: resume.cart.items,
    cashPaid,
    notes: resume.cart.notes,
  };

  return createSale(tx, tenant, saleInput);
}

/**
 * Delete a hold without paying.
 */
export async function deleteHold(
  tx: PrismaClient,
  tenant: TenantRef,
  holdId: string,
) {
  const hold = await tx.posHold.findFirst({
    where: { id: holdId, organizationId: tenant.organizationId },
  });
  if (!hold) throw ApiError.notFound("Hold not found");
  await tx.posHold.delete({ where: { id: holdId } });
  return { deleted: true };
}

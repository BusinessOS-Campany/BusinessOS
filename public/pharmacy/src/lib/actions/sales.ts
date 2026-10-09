"use server";

import { revalidatePath } from "next/cache";
import { createSale, voidSale, SaleError, type SaleItemInput } from "@/lib/sales";
import { requirePermission } from "@/lib/dal";
import { prisma } from "@/lib/prisma";

export type CheckoutInput = {
  customerId?: string | null;
  doctorId?: string | null;
  prescriptionId?: string | null;
  warehouseId: string;
  cashAccountId?: string | null;
  items: SaleItemInput[];
  discountTotal: number;
  paymentMethod: "cash" | "credit" | "mixed";
  paidAmount: number;
  notes?: string | null;
};

export async function checkout(input: CheckoutInput) {
  const user = await requirePermission("sales:create");
  try {
    const result = await createSale({
      ...input,
      discountTotal: input.discountTotal,
      userId: user.id,
    });
    revalidatePath("/sales");
    revalidatePath("/dashboard");
    return { ok: true as const, id: result.id, invoiceNumber: result.invoiceNumber, total: Number(result.total) / 100 };
  } catch (e) {
    if (e instanceof SaleError) {
      return { ok: false as const, error: e.message };
    }
    return { ok: false as const, error: "UNKNOWN" };
  }
}

export async function cancelSale(invoiceId: string, reason?: string) {
  const user = await requirePermission("sales:edit");
  await voidSale(invoiceId, user.id, reason);
  revalidatePath("/sales");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function holdCart(input: {
  label?: string;
  customerId?: string | null;
  warehouseId?: string | null;
  cart: unknown;
}) {
  const user = await requirePermission("pos:operate");
  await prisma.posHold.create({
    data: {
      label: input.label || null,
      customerId: input.customerId || null,
      warehouseId: input.warehouseId || null,
      cart: input.cart as object,
      createdByUserId: user.id,
    },
  });
  revalidatePath("/pos");
  return { ok: true };
}

export async function deleteHold(id: string) {
  await requirePermission("pos:operate");
  await prisma.posHold.delete({ where: { id } });
  revalidatePath("/pos");
  return { ok: true };
}
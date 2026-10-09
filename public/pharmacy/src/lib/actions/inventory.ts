"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/dal";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { recordStockMovement } from "@/lib/inventory";
import { nextAdjustment } from "@/lib/sequences";

const adjustSchema = z.object({
  medicineId: z.string().min(1),
  warehouseId: z.string().min(1),
  delta: z.coerce.number().int(),
  reason: z.string().default("manual"),
});

export async function adjustStock(input: z.infer<typeof adjustSchema>) {
  const user = await requirePermission("inventory:adjust");
  const data = adjustSchema.parse(input);
  if (data.delta === 0) return { ok: true };

  const stock = await prisma.stockLevel.findUnique({
    where: { medicineId_warehouseId: { medicineId: data.medicineId, warehouseId: data.warehouseId } },
  });
  if (!stock) throw new Error("Stock not found");
  if (Number(stock.qty) + data.delta < 0) throw new Error("Cannot go below zero");

  const adjustmentNo = await nextAdjustment();

  await prisma.$transaction(async (tx) => {
    const prev = Number(stock.qty);
    const next = prev + data.delta;
    await tx.stockLevel.update({
      where: { medicineId_warehouseId: { medicineId: data.medicineId, warehouseId: data.warehouseId } },
      data: { qty: { increment: data.delta } },
    });
    await tx.stockAdjustment.create({
      data: {
        adjustmentNo,
        medicineId: data.medicineId,
        warehouseId: data.warehouseId,
        type: data.delta > 0 ? "increase" : "decrease",
        quantity: data.delta,
        previousQty: prev,
        newQty: next,
        reason: data.reason,
        note: null,
        createdByUserId: user.id,
      },
    });
    await tx.inventoryMovement.create({
      data: {
        medicineId: data.medicineId,
        warehouseId: data.warehouseId,
        type: data.delta > 0 ? "adjustment_in" : "adjustment_out",
        qtyDelta: data.delta,
        refType: "adjustment",
        refId: adjustmentNo,
        note: data.reason,
        createdByUserId: user.id,
      },
    });
  });

  await recordAudit(user.id, AUDIT_ACTIONS.ADJUST, "inventory", adjustmentNo, {
    after: { medicineId: data.medicineId, delta: data.delta, reason: data.reason },
  });
  revalidatePath("/inventory");
  revalidatePath("/batches");
  return { ok: true };
}

const transferSchema = z.object({
  medicineId: z.string().min(1),
  fromWarehouseId: z.string().min(1),
  toWarehouseId: z.string().min(1),
  qty: z.coerce.number().int().positive(),
});

export async function transferStock(input: z.infer<typeof transferSchema>) {
  const user = await requirePermission("inventory:transfer");
  const data = transferSchema.parse(input);
  if (data.fromWarehouseId === data.toWarehouseId) throw new Error("Same warehouse");

  const from = await prisma.stockLevel.findUnique({
    where: { medicineId_warehouseId: { medicineId: data.medicineId, warehouseId: data.fromWarehouseId } },
  });
  if (!from || Number(from.qty) < data.qty) throw new Error("Insufficient stock");

  await prisma.$transaction(async (tx) => {
    await tx.stockLevel.update({
      where: { medicineId_warehouseId: { medicineId: data.medicineId, warehouseId: data.fromWarehouseId } },
      data: { qty: { decrement: data.qty } },
    });
    await tx.stockLevel.upsert({
      where: { medicineId_warehouseId: { medicineId: data.medicineId, warehouseId: data.toWarehouseId } },
      create: { medicineId: data.medicineId, warehouseId: data.toWarehouseId, qty: data.qty },
      update: { qty: { increment: data.qty } },
    });
    const ref = `${data.fromWarehouseId}:${data.toWarehouseId}`;
    await tx.inventoryMovement.create({
      data: { medicineId: data.medicineId, warehouseId: data.toWarehouseId, type: "transfer_in", qtyDelta: data.qty, refType: "transfer", refId: ref, createdByUserId: user.id },
    });
    await tx.inventoryMovement.create({
      data: { medicineId: data.medicineId, warehouseId: data.fromWarehouseId, type: "transfer_out", qtyDelta: -data.qty, refType: "transfer", refId: ref, createdByUserId: user.id },
    });
  });

  await recordAudit(user.id, AUDIT_ACTIONS.TRANSFER, "inventory", data.medicineId, {
    after: { from: data.fromWarehouseId, to: data.toWarehouseId, qty: data.qty },
  });
  revalidatePath("/inventory");
  return { ok: true };
}
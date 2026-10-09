"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/dal";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { toMinor } from "@/lib/format";
import { nextPurchase } from "@/lib/sequences";
import { receivePurchaseStock } from "@/lib/inventory";

const itemSchema = z.object({
  medicineId: z.string().min(1),
  quantity: z.coerce.number().positive(),
  unitCost: z.coerce.number().nonnegative(),
  discount: z.coerce.number().default(0),
});

const poSchema = z.object({
  supplierId: z.string().min(1),
  warehouseId: z.string().min(1),
  expectedDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  items: z.array(itemSchema).min(1),
});

export async function createPurchaseOrder(input: z.infer<typeof poSchema>) {
  const user = await requirePermission("purchases:create");
  const data = poSchema.parse(input);

  let subtotal = 0n;
  for (const item of data.items) {
    subtotal += BigInt(item.quantity) * toMinor(item.unitCost);
  }
  const discountTotal = BigInt(Math.round(data.items.reduce((s, i) => s + i.discount * i.quantity, 0)));
  const total = subtotal - discountTotal;

  const poNumber = await nextPurchase();

  await prisma.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.create({
      data: {
        poNumber,
        supplierId: data.supplierId,
        warehouseId: data.warehouseId,
        status: "ordered",
        expectedDate: data.expectedDate ? new Date(data.expectedDate) : null,
        subtotal,
        discountTotal,
        total,
        paidTotal: 0n,
        notes: data.notes || null,
        createdByUserId: user.id,
      },
    });
    for (const item of data.items) {
      const lineCost = BigInt(item.quantity) * toMinor(item.unitCost);
      await tx.purchaseItem.create({
        data: {
          purchaseOrderId: po.id,
          medicineId: item.medicineId,
          quantity: item.quantity,
          receivedQty: 0,
          unitCost: toMinor(item.unitCost),
          discount: toMinor(item.discount),
          lineTotal: lineCost - toMinor(item.discount) * BigInt(item.quantity),
        },
      });
    }
    await recordAudit(user.id, AUDIT_ACTIONS.CREATE, "purchaseOrder", po.id, { after: { poNumber } });
  });

  revalidatePath("/purchases");
  return { ok: true };
}

const receiveSchema = z.object({
  purchaseId: z.string().min(1),
  warehouseId: z.string().min(1),
  items: z.array(
    z.object({
      purchaseItemId: z.string().min(1),
      medicineId: z.string().min(1),
      batchNo: z.string().min(1),
      qty: z.coerce.number().positive(),
      unitCost: z.coerce.number().nonnegative(),
      expiryDate: z.string().min(1),
      mfgDate: z.string().optional().nullable(),
    })
  ),
});

export async function receivePurchase(input: z.infer<typeof receiveSchema>) {
  const user = await requirePermission("purchases:receive");
  const data = receiveSchema.parse(input);

  const po = await prisma.purchaseOrder.findUnique({ where: { id: data.purchaseId } });
  if (!po) throw new Error("PO not found");
  if (po.status === "received") throw new Error("PO already received");

  // Validate none of the lines exceed the ordered quantity.
  const lines = await prisma.purchaseItem.findMany({ where: { purchaseOrderId: po.id } });
  for (const item of data.items) {
    const line = lines.find((l) => l.id === item.purchaseItemId);
    if (!line) throw new Error("Invalid line");
    if (Number(line.receivedQty) + item.qty > Number(line.quantity)) {
      throw new Error("Received qty exceeds ordered qty");
    }
  }

  await receivePurchaseStock({
    purchaseId: po.id,
    warehouseId: data.warehouseId,
    items: data.items.map((i) => ({ ...i, batchId: null })),
    userId: user.id,
  });

  await recordAudit(user.id, AUDIT_ACTIONS.CREATE, "purchaseReceive", po.id, { after: { poNumber: po.poNumber } });
  revalidatePath("/purchases");
  revalidatePath("/inventory");
  revalidatePath("/batches");
  return { ok: true };
}

export async function cancelPurchase(id: string) {
  const user = await requirePermission("purchases:create");
  const po = await prisma.purchaseOrder.findUnique({ where: { id } });
  if (!po || po.status !== "ordered") throw new Error("Cannot cancel");
  await prisma.purchaseOrder.update({ where: { id }, data: { status: "cancelled" } });
  await recordAudit(user.id, AUDIT_ACTIONS.UPDATE, "purchaseOrder", id, { after: { status: "cancelled" } });
  revalidatePath("/purchases");
  return { ok: true };
}


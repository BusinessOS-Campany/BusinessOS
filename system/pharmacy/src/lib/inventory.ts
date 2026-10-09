import "server-only";
import { prisma } from "@/lib/prisma";
import { toMinor } from "@/lib/format";

export type PurchaseMedicineInput = {
  medicineId: string;
  purchaseItemId: string;
  batchNo: string;
  qty: number; // quantity being received now
  unitCost: number; // major units
  expiryDate: string; // ISO date
  mfgDate?: string | null;
  batchId?: string | null; // when receiving against an existing batch (supplier return restock)
};

// Returns default warehouse for the branch (first active one).
export async function defaultWarehouse(): Promise<string | null> {
  const w = await prisma.warehouse.findFirst({ where: { isActive: true }, orderBy: { createdAt: "asc" } });
  return w?.id ?? null;
}

export async function receivePurchaseStock({
  purchaseId,
  warehouseId,
  items,
  userId,
}: {
  purchaseId: string;
  warehouseId: string;
  items: PurchaseMedicineInput[];
  userId: string;
}) {
  return prisma.$transaction(async (tx) => {
    for (const item of items) {
      await tx.medicineBatch.create({
        data: {
          medicineId: item.medicineId,
          supplierId: null,
          purchaseId,
          batchNo: item.batchNo,
          mfgDate: item.mfgDate ? new Date(item.mfgDate) : null,
          expiryDate: new Date(item.expiryDate),
          initialQty: item.qty,
          remainingQty: item.qty,
          purchasePrice: toMinor(item.unitCost),
        },
      });

      await tx.stockLevel.upsert({
        where: {
          medicineId_warehouseId: { medicineId: item.medicineId, warehouseId },
        },
        create: { medicineId: item.medicineId, warehouseId, qty: item.qty },
        update: { qty: { increment: item.qty } },
      });

      await tx.purchaseItem.update({
        where: { id: item.purchaseItemId },
        data: { receivedQty: { increment: item.qty } },
      });

      await tx.inventoryMovement.create({
        data: {
          medicineId: item.medicineId,
          warehouseId,
          batchId: null,
          type: "purchase",
          qtyDelta: item.qty,
          refType: "purchaseOrder",
          refId: purchaseId,
          note: `purchase receive (${item.batchNo})`,
          createdByUserId: userId,
        },
      });
    }

    const poItems = await tx.purchaseItem.findMany({ where: { purchaseOrderId: purchaseId } });
    const fullyReceived = poItems.every((pi) => Number(pi.receivedQty) >= Number(pi.quantity));
    await tx.purchaseOrder.update({
      where: { id: purchaseId },
      data: { status: fullyReceived ? "received" : "partially_received", receivedDate: new Date() },
    });
  });
}

export async function recordStockMovement({
  medicineId,
  warehouseId,
  type,
  qtyDelta,
  refType,
  refId,
  note,
  userId,
  batchId,
}: {
  medicineId: string;
  warehouseId: string;
  type: string;
  qtyDelta: number;
  refType?: string;
  refId?: string;
  note?: string;
  userId: string;
  batchId?: string;
}) {
  await prisma.inventoryMovement.create({
    data: {
      medicineId,
      warehouseId,
      batchId,
      type,
      qtyDelta,
      refType,
      refId,
      note,
      createdByUserId: userId,
    },
  });
}
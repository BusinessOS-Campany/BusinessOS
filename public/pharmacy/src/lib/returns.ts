import "server-only";
import { prisma } from "@/lib/prisma";
import { nextReturn, nextSupplierReturn } from "@/lib/sequences";
import { toMinor } from "@/lib/format";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { defaultWarehouse } from "@/lib/inventory";

export class ReturnError extends Error {}

export async function createSalesReturn({
  invoiceId,
  items,
  reason,
  cashAccountId,
  userId,
}: {
  invoiceId: string;
  items: Array<{ salesInvoiceItemId: string; medicineId: string; batchId: string | null; qty: number; unitPrice: number; lineTotal: number }>;
  reason?: string | null;
  cashAccountId?: string | null;
  userId: string;
}) {
  const invoice = await prisma.salesInvoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw new ReturnError("NOT_FOUND");
  if (invoice.status !== "posted") throw new ReturnError("INVOICE_NOT_POSTED");

  const returnNumber = await nextReturn();
  const total = items.reduce((s, i) => s + i.lineTotal, 0);

  return prisma.$transaction(async (tx) => {
    // Validate against invoice items and already-returned quantities.
const invItems = await tx.salesInvoiceItem.findMany({ where: { invoiceId } });
    const returnIds = (await tx.salesReturn.findMany({ where: { invoiceId } })).map((r) => r.id);
    const existing = await tx.salesReturnItem.findMany({ where: { returnId: { in: returnIds } }, select: { medicineId: true, qty: true } });
    for (const item of items) {
      const line = invItems.find((i) => i.id === item.salesInvoiceItemId);
      if (!line) throw new ReturnError("BAD_ITEM");
      const returnedSoFar = existing.filter((e) => e.medicineId === item.medicineId).reduce((s, e) => s + Number(e.qty), 0);
      if (returnedSoFar + item.qty > Number(line.qty)) throw new ReturnError("EXCEEDS_SOLD");
    }

    const refund = await tx.salesReturn.create({
      data: {
        returnNumber,
        invoiceId,
        total: toMinor(total),
        refunded: toMinor(total),
        reason: reason || null,
        createdByUserId: userId,
      },
    });

    for (const item of items) {
      await tx.salesReturnItem.create({
        data: {
          returnId: refund.id,
          medicineId: item.medicineId,
          batchId: item.batchId,
          qty: item.qty,
          unitPrice: toMinor(item.unitPrice),
          lineTotal: toMinor(item.lineTotal),
        },
      });

      await tx.stockLevel.upsert({
        where: { medicineId_warehouseId: { medicineId: item.medicineId, warehouseId: invoice.warehouseId ?? "" } },
        create: { medicineId: item.medicineId, warehouseId: invoice.warehouseId ?? "", qty: item.qty },
        update: { qty: { increment: item.qty } },
      });

      if (item.batchId) {
        await tx.medicineBatch.update({ where: { id: item.batchId }, data: { remainingQty: { increment: item.qty } } });
      }

      await tx.inventoryMovement.create({
        data: {
          medicineId: item.medicineId,
          warehouseId: invoice.warehouseId ?? "",
          batchId: item.batchId,
          type: "return",
          qtyDelta: item.qty,
          refType: "salesReturn",
          refId: refund.id,
          note: reason || "sales return",
          createdByUserId: userId,
        },
      });
    }

    if (cashAccountId) {
      await tx.cashMovement.create({
        data: {
          cashAccountId,
          delta: -toMinor(total),
          reason: "sale_refund",
          refType: "salesReturn",
          refId: refund.id,
          createdByUserId: userId,
        },
      });
    }

    if (invoice.customerId) {
      const due = invoice.total - invoice.paidTotal;
      if (due > 0n) {
        await tx.customer.update({ where: { id: invoice.customerId }, data: { balance: { decrement: toMinor(total) > due ? due : toMinor(total) } } });
      }
    }

    await recordAudit(userId, AUDIT_ACTIONS.RETURN, "salesReturn", refund.id, { after: { returnNumber, total } });
    return { ok: true };
  });
}

export async function createSupplierReturn({
  supplierId,
  purchaseId,
  items,
  reason,
  userId,
}: {
  supplierId: string;
  purchaseId?: string | null;
  items: Array<{ medicineId: string; batchId: string | null; qty: number; unitCost: number }>;
  reason: string;
  userId: string;
}) {
const returnNumber = await nextSupplierReturn();
  const total = items.reduce((s, i) => s + i.qty * i.unitCost, 0);
  const warehouseId = (await defaultWarehouse()) ?? "";

  return prisma.$transaction(async (tx) => {
    const created = await tx.supplierReturn.create({
      data: {
        returnNumber,
        supplierId,
        purchaseId: purchaseId || null,
        total: toMinor(total),
        refundAmount: toMinor(total),
        reason,
        createdByUserId: userId,
      },
    });

    for (const item of items) {
      await tx.supplierReturnItem.create({
        data: {
          supplierReturnId: created.id,
          medicineId: item.medicineId,
          batchId: item.batchId,
          quantity: item.qty,
          unitCost: toMinor(item.unitCost),
          lineTotal: toMinor(item.qty * item.unitCost),
        },
      });

      if (item.batchId) {
        await tx.medicineBatch.update({ where: { id: item.batchId }, data: { remainingQty: { decrement: item.qty } } });
      }
      await tx.stockLevel.updateMany({
        where: { medicineId: item.medicineId },
        data: { qty: { decrement: item.qty } },
      });
await tx.inventoryMovement.create({
        data: {
          medicineId: item.medicineId,
          warehouseId,
          batchId: item.batchId,
          type: "purchase_return",
          qtyDelta: -item.qty,
          refType: "supplierReturn",
          refId: created.id,
          note: reason,
          createdByUserId: userId,
        },
      });
    }

    await tx.supplier.update({ where: { id: supplierId }, data: { balance: { decrement: toMinor(total) } } });

    await recordAudit(userId, AUDIT_ACTIONS.RETURN, "supplierReturn", created.id, { after: { returnNumber, total } });
    return { ok: true };
  });
}

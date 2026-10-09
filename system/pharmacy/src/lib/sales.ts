import "server-only";
import { prisma } from "@/lib/prisma";
import { nextInvoice } from "@/lib/sequences";
import { toMinor } from "@/lib/format";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";

export type SaleItemInput = {
  medicineId: string;
  qty: number;
  unitPrice: number; // major units
  discount: number; // major units (line)
};

export type CreateSaleInput = {
  customerId?: string | null;
  doctorId?: string | null;
  prescriptionId?: string | null;
  warehouseId: string;
  items: SaleItemInput[];
  discountTotal: number; // major units (invoice-level)
  taxRateBps?: number;
  paymentMethod: "cash" | "credit" | "mixed";
  paidAmount: number; // major units
  notes?: string | null;
  cashAccountId?: string | null;
  userId: string;
};

export class SaleError extends Error {}

export async function createSale(input: CreateSaleInput) {
  if (input.items.length === 0) throw new SaleError("EMPTY_CART");

  const invoiceNumber = await nextInvoice();

  return prisma.$transaction(async (tx) => {
    let subtotal = 0;
    let lineDiscountTotal = 0;
    let taxTotal = 0;
    let itemCostTotal = 0;

    type PreparedItem = {
      medicineId: string;
      batchId: string;
      qty: number;
      unitPriceMinor: bigint;
      discountMinor: bigint;
      taxRateBps: number;
      lineSubtotal: bigint;
      lineTax: bigint;
      lineTotal: bigint;
      unitCost: bigint;
      allocations: Array<{ batchId: string; qty: number }>;
    };
    const prepared: PreparedItem[] = [];

    for (const item of input.items) {
      const lineSubtotal = toMinor(item.unitPrice * item.qty);
      const discountMinor = toMinor(item.discount);
      const net = lineSubtotal - discountMinor;
      const taxRateBps = input.taxRateBps ?? 0;
      const lineTax = BigInt(Math.round((Number(net) * taxRateBps) / 10000));
      const lineTotal = net + lineTax;

      // FEFO allocation: earliest expiry first, exclude expired.
      const now = new Date();
      const batches = await tx.medicineBatch.findMany({
        where: {
          medicineId: item.medicineId,
          status: "active",
          remainingQty: { gt: 0 },
          expiryDate: { gt: now },
        },
        orderBy: { expiryDate: "asc" },
      });

      const available = batches.reduce((s, b) => s + Number(b.remainingQty), 0);
      if (available < item.qty) {
        const med = await tx.medicine.findUnique({ where: { id: item.medicineId }, select: { nameAr: true } });
        throw new SaleError(`INSUFFICIENT_STOCK:${med?.nameAr ?? item.medicineId}:${available}`);
      }

      let remaining = item.qty;
      const allocations: Array<{ batchId: string; qty: number }> = [];
      let unitCost = 0n;
      for (const batch of batches) {
        if (remaining <= 0) break;
        const take = Math.min(Number(batch.remainingQty), remaining);
        remaining -= take;
        allocations.push({ batchId: batch.id, qty: take });
        if (unitCost === 0n) unitCost = batch.purchasePrice;
      }

      subtotal += Number(lineSubtotal);
      lineDiscountTotal += Number(discountMinor);
      taxTotal += Number(lineTax);
      itemCostTotal += Number(unitCost) * item.qty;

      prepared.push({
        medicineId: item.medicineId,
        batchId: allocations[0].batchId,
        qty: item.qty,
        unitPriceMinor: toMinor(item.unitPrice),
        discountMinor,
        taxRateBps,
        lineSubtotal,
        lineTax,
        lineTotal,
        unitCost,
        allocations,
      });
    }

    const invoiceDiscountMinor = toMinor(input.discountTotal);
    const totalMinor =
      BigInt(subtotal) - BigInt(lineDiscountTotal) + BigInt(taxTotal) - invoiceDiscountMinor;
    const paidMinor = toMinor(input.paidAmount);

    const invoice = await tx.salesInvoice.create({
      data: {
        invoiceNumber,
        customerId: input.customerId || null,
        doctorId: input.doctorId || null,
        prescriptionId: input.prescriptionId || null,
        warehouseId: input.warehouseId,
        status: "posted",
        subtotal: BigInt(subtotal),
        discountTotal: BigInt(lineDiscountTotal) + invoiceDiscountMinor,
        taxTotal: BigInt(taxTotal),
        total: totalMinor,
        paidTotal: paidMinor > totalMinor ? totalMinor : paidMinor,
        paymentMethod: input.paymentMethod,
        notes: input.notes || null,
        createdByUserId: input.userId,
      },
    });

    for (const item of prepared) {
      await tx.salesInvoiceItem.create({
        data: {
          invoiceId: invoice.id,
          medicineId: item.medicineId,
          batchId: item.batchId,
          qty: item.qty,
          unitPrice: item.unitPriceMinor,
          discount: item.discountMinor,
          taxRateBps: item.taxRateBps,
          lineSubtotal: item.lineSubtotal,
          lineTax: item.lineTax,
          lineTotal: item.lineTotal,
          unitCost: item.unitCost,
        },
      });

      for (const alloc of item.allocations) {
        await tx.medicineBatch.update({
          where: { id: alloc.batchId },
          data: { remainingQty: { decrement: alloc.qty } },
        });
        await tx.inventoryMovement.create({
          data: {
            medicineId: item.medicineId,
            warehouseId: input.warehouseId,
            batchId: alloc.batchId,
            type: "sale",
            qtyDelta: -alloc.qty,
            refType: "salesInvoice",
            refId: invoice.id,
            createdByUserId: input.userId,
          },
        });
      }

      await tx.stockLevel.upsert({
        where: {
          medicineId_warehouseId: { medicineId: item.medicineId, warehouseId: input.warehouseId },
        },
        create: { medicineId: item.medicineId, warehouseId: input.warehouseId, qty: -item.qty },
        update: { qty: { decrement: item.qty } },
      });
    }

    if (paidMinor > 0n) {
      await tx.payment.create({
        data: {
          invoiceId: invoice.id,
          method: input.paymentMethod === "credit" ? "cash" : input.paymentMethod,
          amount: paidMinor > totalMinor ? totalMinor : paidMinor,
          cashAccountId: input.cashAccountId || null,
          createdByUserId: input.userId,
        },
      });

      if (input.cashAccountId) {
        const session = await tx.cashSession.findFirst({
          where: { cashAccountId: input.cashAccountId, status: "open" },
        });
        await tx.cashMovement.create({
          data: {
            cashAccountId: input.cashAccountId,
            sessionId: session?.id ?? null,
            delta: paidMinor > totalMinor ? totalMinor : paidMinor,
            reason: "sale_payment",
            refType: "salesInvoice",
            refId: invoice.id,
            createdByUserId: input.userId,
          },
        });
      }
    }

    const due = totalMinor - paidMinor;
    if (due > 0n && input.customerId) {
      await tx.customer.update({
        where: { id: input.customerId },
        data: { balance: { increment: due } },
      });
    }

    if (input.prescriptionId) {
      await tx.prescription.update({
        where: { id: input.prescriptionId },
        data: { status: "dispensed" },
      });
    }

    await recordAudit(input.userId, AUDIT_ACTIONS.CREATE, "salesInvoice", invoice.id, {
      after: { invoiceNumber, total: totalMinor.toString() },
    });

    return { id: invoice.id, invoiceNumber, total: totalMinor };
  });
}

export async function voidSale(invoiceId: string, userId: string, reason?: string) {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.salesInvoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new SaleError("NOT_FOUND");
    if (invoice.status === "voided") throw new SaleError("ALREADY_VOIDED");

    const items = await tx.salesInvoiceItem.findMany({ where: { invoiceId } });

    for (const item of items) {
      await tx.stockLevel.upsert({
        where: {
          medicineId_warehouseId: {
            medicineId: item.medicineId,
            warehouseId: invoice.warehouseId ?? "",
          },
        },
        create: {
          medicineId: item.medicineId,
          warehouseId: invoice.warehouseId ?? "",
          qty: Number(item.qty),
        },
        update: { qty: { increment: Number(item.qty) } },
      });

      const movements = await tx.inventoryMovement.findMany({
        where: { refType: "salesInvoice", refId: invoiceId, medicineId: item.medicineId },
      });
      for (const mv of movements) {
        if (mv.batchId) {
          await tx.medicineBatch.update({
            where: { id: mv.batchId },
            data: { remainingQty: { increment: Math.abs(Number(mv.qtyDelta)) } },
          });
        }
      }

      await tx.inventoryMovement.create({
        data: {
          medicineId: item.medicineId,
          warehouseId: invoice.warehouseId ?? "",
          type: "sale_return",
          qtyDelta: Number(item.qty),
          refType: "void",
          refId: invoiceId,
          note: reason ?? "voided sale",
          createdByUserId: userId,
        },
      });
    }

    if (invoice.customerId) {
      const due = invoice.total - invoice.paidTotal;
      if (due > 0n) {
        await tx.customer.update({
          where: { id: invoice.customerId },
          data: { balance: { decrement: due } },
        });
      }
    }

    await tx.salesInvoice.update({ where: { id: invoiceId }, data: { status: "voided" } });
    await recordAudit(userId, AUDIT_ACTIONS.VOID, "salesInvoice", invoiceId, { after: { status: "voided" } });

    return { ok: true };
  });
}
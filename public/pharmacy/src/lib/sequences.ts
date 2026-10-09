import "server-only";
import { prisma } from "@/lib/prisma";

export async function nextNumber(
  key: string,
  prefix: string,
  padding = 5
): Promise<string> {
  const seq = await prisma.$transaction(async (tx) => {
    const row = await tx.numberSequence.findUnique({ where: { key } });
    if (!row) {
      await tx.numberSequence.create({
        data: { key, prefix, nextValue: 2, padding },
      });
      return { prefix, value: 1, padding };
    }
    const value = row.nextValue;
    await tx.numberSequence.update({
      where: { key },
      data: { nextValue: value + 1 },
    });
    return { prefix: row.prefix ?? prefix, value, padding: row.padding };
  });
  return `${seq.prefix}${String(seq.value).padStart(seq.padding, "0")}`;
}

export const SEQUENCES = {
  invoice: { key: "invoice", prefix: "INV-", padding: 5 },
  return: { key: "return", prefix: "RTN-", padding: 5 },
  purchase: { key: "purchase", prefix: "PO-", padding: 5 },
  supplierReturn: { key: "supplier_return", prefix: "SR-", padding: 5 },
  prescription: { key: "prescription", prefix: "RX-", padding: 5 },
  adjustment: { key: "adjustment", prefix: "ADJ-", padding: 5 },
} as const;

export function nextInvoice() {
  return nextNumber(SEQUENCES.invoice.key, SEQUENCES.invoice.prefix, SEQUENCES.invoice.padding);
}
export function nextReturn() {
  return nextNumber(SEQUENCES.return.key, SEQUENCES.return.prefix, SEQUENCES.return.padding);
}
export function nextPurchase() {
  return nextNumber(SEQUENCES.purchase.key, SEQUENCES.purchase.prefix, SEQUENCES.purchase.padding);
}
export function nextSupplierReturn() {
  return nextNumber(SEQUENCES.supplierReturn.key, SEQUENCES.supplierReturn.prefix, SEQUENCES.supplierReturn.padding);
}
export function nextPrescription() {
  return nextNumber(SEQUENCES.prescription.key, SEQUENCES.prescription.prefix, SEQUENCES.prescription.padding);
}
export function nextAdjustment() {
  return nextNumber(SEQUENCES.adjustment.key, SEQUENCES.adjustment.prefix, SEQUENCES.adjustment.padding);
}
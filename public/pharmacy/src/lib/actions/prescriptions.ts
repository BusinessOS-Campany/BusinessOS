"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/dal";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { nextPrescription } from "@/lib/sequences";
import { createSale } from "@/lib/sales";
import { defaultWarehouse } from "@/lib/inventory";

const itemSchema = z.object({
  medicineId: z.string().optional().nullable(),
  medicineName: z.string().min(1),
  dosage: z.string().optional().nullable(),
  frequency: z.string().optional().nullable(),
  duration: z.string().optional().nullable(),
  quantity: z.coerce.number().optional().nullable(),
});

const rxSchema = z.object({
  customerId: z.string().optional().nullable(),
  doctorId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  items: z.array(itemSchema).min(1),
});

export async function savePrescription(input: z.infer<typeof rxSchema>) {
  const user = await requirePermission("prescriptions:create");
  const data = rxSchema.parse(input);
  const prescriptionNo = await nextPrescription();

  const rx = await prisma.prescription.create({
    data: {
      prescriptionNo,
      customerId: data.customerId || null,
      doctorId: data.doctorId || null,
      status: "pending",
      notes: data.notes || null,
      createdByUserId: user.id,
    },
  });

  for (const item of data.items) {
    await prisma.prescriptionItem.create({
      data: {
        prescriptionId: rx.id,
        medicineId: item.medicineId || null,
        medicineName: item.medicineName,
        dosage: item.dosage || null,
        frequency: item.frequency || null,
        duration: item.duration || null,
        quantity: item.quantity ?? null,
        dispensedQty: 0,
        notes: null,
      },
    });
  }

  await recordAudit(user.id, AUDIT_ACTIONS.CREATE, "prescription", rx.id, { after: { prescriptionNo } });
  revalidatePath("/prescriptions");
  return { ok: true, id: rx.id };
}

export async function dispensePrescription(id: string) {
  const user = await requirePermission("prescriptions:edit");
  const rx = await prisma.prescription.findUnique({ where: { id } });
  if (!rx) throw new Error("NOT_FOUND");
  if (rx.status !== "pending") throw new Error("Already dispensed");

  const items = await prisma.prescriptionItem.findMany({ where: { prescriptionId: id } });
  const mapped = items
    .filter((i) => i.medicineId && Number(i.dispensedQty) < Number(i.quantity ?? 0))
    .map((i) => ({ id: i.id, medicineId: i.medicineId!, qty: Number(i.quantity ?? 0) - Number(i.dispensedQty) }));

  if (mapped.length === 0) throw new Error("Nothing to dispense");

  const medicines = await prisma.medicine.findMany({ where: { id: { in: mapped.map((m) => m.medicineId) } } });
  const priceMap = new Map(medicines.map((m) => [m.id, Number(m.salePrice) / 100]));
  const warehouseId = (await defaultWarehouse())!;
  const cashAccount = await prisma.cashAccount.findFirst({ where: { isActive: true } });

  const saleItems = mapped.map((m) => ({ medicineId: m.medicineId, qty: m.qty, unitPrice: priceMap.get(m.medicineId) ?? 0, discount: 0 }));
  const totalMinor = saleItems.reduce((s, i) => s + BigInt(i.qty) * BigInt(Math.round(i.unitPrice * 100)), 0n);

  const sale = await createSale({
    customerId: rx.customerId,
    doctorId: rx.doctorId,
    prescriptionId: rx.id,
    warehouseId,
    items: saleItems,
    discountTotal: 0,
    paymentMethod: "cash",
    paidAmount: Number(totalMinor) / 100,
    cashAccountId: cashAccount?.id ?? null,
    userId: user.id,
  });

  for (const m of mapped) {
    await prisma.prescriptionItem.update({
      where: { id: m.id },
      data: { dispensedQty: { increment: m.qty } },
    });
  }

  await recordAudit(user.id, AUDIT_ACTIONS.DISPENSE, "prescription", id, { after: { invoiceNumber: sale.invoiceNumber } });
  revalidatePath("/prescriptions");
  return { ok: true, invoiceNumber: sale.invoiceNumber };
}

export async function cancelPrescription(id: string) {
  const user = await requirePermission("prescriptions:edit");
  await prisma.prescription.update({ where: { id }, data: { status: "cancelled" } });
  await recordAudit(user.id, AUDIT_ACTIONS.UPDATE, "prescription", id, { after: { status: "cancelled" } });
  revalidatePath("/prescriptions");
  return { ok: true };
}
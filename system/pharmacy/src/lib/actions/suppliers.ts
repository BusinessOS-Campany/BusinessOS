"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/dal";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { toMinor } from "@/lib/format";

const schema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  nameAr: z.string().optional().nullable(),
  contactPerson: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  governorate: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  taxNumber: z.string().optional().nullable(),
  paymentTerms: z.string().optional().nullable(),
  creditLimit: z.coerce.number().default(0),
  notes: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
});

export type SupplierInput = z.infer<typeof schema>;

export async function saveSupplier(input: SupplierInput) {
  const user = await requirePermission("suppliers:create");
  const data = schema.parse(input);
  const payload = {
    name: data.name,
    nameAr: data.nameAr || null,
    contactPerson: data.contactPerson || null,
    phone: data.phone || null,
    email: data.email || null,
    address: data.address || null,
    governorate: data.governorate || null,
    city: data.city || null,
    taxNumber: data.taxNumber || null,
    paymentTerms: data.paymentTerms || null,
    creditLimit: toMinor(data.creditLimit),
    notes: data.notes || null,
    isActive: data.isActive,
  };
  if (data.id) {
    const before = await prisma.supplier.findUnique({ where: { id: data.id } });
    await prisma.supplier.update({ where: { id: data.id }, data: payload });
    await recordAudit(user.id, AUDIT_ACTIONS.UPDATE, "supplier", data.id, { before, after: payload });
  } else {
    const created = await prisma.supplier.create({ data: payload });
    await recordAudit(user.id, AUDIT_ACTIONS.CREATE, "supplier", created.id);
  }
  revalidatePath("/suppliers");
  return { ok: true };
}

export async function deleteSupplier(id: string) {
  await requirePermission("suppliers:edit");
  await prisma.supplier.update({ where: { id }, data: { isActive: false } });
  revalidatePath("/suppliers");
  return { ok: true };
}

export async function paySupplier(input: { supplierId: string; amount: number; method: string; note?: string; cashAccountId?: string | null }) {
  const user = await requirePermission("suppliers:edit");
  const amount = toMinor(input.amount);
  await prisma.$transaction(async (tx) => {
    await tx.supplierPayment.create({
      data: {
        supplierId: input.supplierId,
        amount,
        method: input.method,
        note: input.note || null,
        createdByUserId: user.id,
      },
    });
    await tx.supplier.update({ where: { id: input.supplierId }, data: { balance: { decrement: amount } } });
    if (input.cashAccountId) {
      await tx.cashMovement.create({
        data: {
          cashAccountId: input.cashAccountId,
          delta: -amount,
          reason: "purchase_payment",
          refType: "supplier",
          refId: input.supplierId,
          createdByUserId: user.id,
        },
      });
    }
  });
  await recordAudit(user.id, AUDIT_ACTIONS.PAYMENT, "supplier", input.supplierId, { after: { amount: amount.toString() } });
  revalidatePath("/suppliers");
  return { ok: true };
}
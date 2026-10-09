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
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  gender: z.string().optional().nullable(),
  creditLimit: z.coerce.number().default(0),
  notes: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
});

export type CustomerInput = z.infer<typeof schema>;

export async function saveCustomer(input: CustomerInput) {
  const user = await requirePermission("customers:create");
  const data = schema.parse(input);
  const payload = {
    name: data.name,
    phone: data.phone || null,
    address: data.address || null,
    gender: data.gender || null,
    creditLimit: toMinor(data.creditLimit),
    notes: data.notes || null,
    isActive: data.isActive,
  };
  if (data.id) {
    await prisma.customer.update({ where: { id: data.id }, data: payload });
    await recordAudit(user.id, AUDIT_ACTIONS.UPDATE, "customer", data.id);
  } else {
    const created = await prisma.customer.create({ data: payload });
    await recordAudit(user.id, AUDIT_ACTIONS.CREATE, "customer", created.id);
  }
  revalidatePath("/customers");
  return { ok: true };
}

export async function deleteCustomer(id: string) {
  await requirePermission("customers:edit");
  await prisma.customer.update({ where: { id }, data: { isActive: false } });
  revalidatePath("/customers");
  return { ok: true };
}

export async function receiveCustomerPayment(input: { customerId: string; amount: number; method: string; note?: string; cashAccountId?: string | null }) {
  const user = await requirePermission("customers:edit");
  const amount = toMinor(input.amount);
  await prisma.$transaction(async (tx) => {
    await tx.customer.update({ where: { id: input.customerId }, data: { balance: { decrement: amount } } });
    if (input.cashAccountId) {
      await tx.cashMovement.create({
        data: {
          cashAccountId: input.cashAccountId,
          delta: amount,
          reason: "deposit",
          refType: "customer",
          refId: input.customerId,
          note: input.note || null,
          createdByUserId: user.id,
        },
      });
    }
  });
  await recordAudit(user.id, AUDIT_ACTIONS.PAYMENT, "customer", input.customerId, { after: { amount: amount.toString() } });
  revalidatePath("/customers");
  return { ok: true };
}
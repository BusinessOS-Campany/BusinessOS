"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/dal";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";

const schema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  specialty: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  clinic: z.string().optional().nullable(),
  hospital: z.string().optional().nullable(),
  licenseNo: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
});

export type DoctorInput = z.infer<typeof schema>;

export async function saveDoctor(input: DoctorInput) {
  const user = await requirePermission("doctors:create");
  const data = schema.parse(input);
  const payload = {
    name: data.name,
    specialty: data.specialty || null,
    phone: data.phone || null,
    clinic: data.clinic || null,
    hospital: data.hospital || null,
    licenseNo: data.licenseNo || null,
    notes: data.notes || null,
    isActive: data.isActive,
  };
  if (data.id) {
    await prisma.doctor.update({ where: { id: data.id }, data: payload });
    await recordAudit(user.id, AUDIT_ACTIONS.UPDATE, "doctor", data.id);
  } else {
    const created = await prisma.doctor.create({ data: payload });
    await recordAudit(user.id, AUDIT_ACTIONS.CREATE, "doctor", created.id);
  }
  revalidatePath("/doctors");
  return { ok: true };
}

export async function deleteDoctor(id: string) {
  await requirePermission("doctors:edit");
  await prisma.doctor.update({ where: { id }, data: { isActive: false } });
  revalidatePath("/doctors");
  return { ok: true };
}
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/dal";
import { recordAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { toMinor } from "@/lib/format";

const medicineSchema = z.object({
  id: z.string().optional(),
  nameAr: z.string().min(1),
  nameEn: z.string().optional().nullable(),
  genericName: z.string().optional().nullable(),
  strength: z.string().optional().nullable(),
  dosageForm: z.string().optional().nullable(),
  medicineType: z.string().default("otc"),
  categoryId: z.string().optional().nullable(),
  manufacturerId: z.string().optional().nullable(),
  sku: z.string().optional().nullable(),
  barcode: z.string().optional().nullable(),
  unit: z.string().default("pack"),
  minStock: z.coerce.number().optional().nullable(),
  reorderLevel: z.coerce.number().optional().nullable(),
  purchasePrice: z.coerce.number().default(0),
  salePrice: z.coerce.number().default(0),
  wholesalePrice: z.coerce.number().optional().nullable(),
  requiresPrescription: z.boolean().default(false),
  controlled: z.boolean().default(false),
  isActive: z.boolean().default(true),
  description: z.string().optional().nullable(),
});

export type MedicineInput = z.infer<typeof medicineSchema>;

export async function saveMedicine(input: MedicineInput) {
  const user = await requirePermission("medicines:edit");
  const data = medicineSchema.parse(input);

  const payload = {
    nameAr: data.nameAr,
    nameEn: data.nameEn || null,
    genericName: data.genericName || null,
    strength: data.strength || null,
    dosageForm: data.dosageForm || null,
    medicineType: data.medicineType,
    categoryId: data.categoryId || null,
    manufacturerId: data.manufacturerId || null,
    sku: data.sku || null,
    barcode: data.barcode || null,
    unit: data.unit,
    minStock: data.minStock ?? null,
    reorderLevel: data.reorderLevel ?? null,
    purchasePrice: toMinor(data.purchasePrice),
    salePrice: toMinor(data.salePrice),
    wholesalePrice: data.wholesalePrice != null ? toMinor(data.wholesalePrice) : null,
    requiresPrescription: data.requiresPrescription,
    controlled: data.controlled,
    isActive: data.isActive,
    description: data.description || null,
  };

  if (data.id) {
    const before = await prisma.medicine.findUnique({ where: { id: data.id } });
    const updated = await prisma.medicine.update({ where: { id: data.id }, data: payload });
    await recordAudit(user.id, AUDIT_ACTIONS.UPDATE, "medicine", updated.id, { before, after: updated });
    revalidatePath("/medicines");
    return { ok: true, id: updated.id };
  }

  const created = await prisma.medicine.create({ data: payload });
  await recordAudit(user.id, AUDIT_ACTIONS.CREATE, "medicine", created.id, { after: created });
  revalidatePath("/medicines");
  return { ok: true, id: created.id };
}

export async function deleteMedicine(id: string) {
  const user = await requirePermission("medicines:delete");
  const batchCount = await prisma.medicineBatch.count({ where: { medicineId: id } });
  if (batchCount > 0) {
    const before = await prisma.medicine.findUnique({ where: { id } });
    await prisma.medicine.update({ where: { id }, data: { isActive: false } });
    await recordAudit(user.id, AUDIT_ACTIONS.UPDATE, "medicine", id, { before, after: { isActive: false } });
  } else {
    await prisma.medicine.delete({ where: { id } });
    await recordAudit(user.id, AUDIT_ACTIONS.DELETE, "medicine", id);
  }
  revalidatePath("/medicines");
  return { ok: true };
}

export async function saveCategory(input: { id?: string; nameAr: string; nameEn?: string | null }) {
  await requirePermission("medicines:edit");
  if (input.id) {
    await prisma.category.update({
      where: { id: input.id },
      data: { nameAr: input.nameAr, nameEn: input.nameEn || null },
    });
  } else {
    await prisma.category.create({ data: { nameAr: input.nameAr, nameEn: input.nameEn || null } });
  }
  revalidatePath("/medicines");
  revalidatePath("/settings");
  return { ok: true };
}

export async function saveManufacturer(input: {
  id?: string;
  nameAr: string;
  nameEn?: string | null;
  country?: string | null;
}) {
  await requirePermission("medicines:edit");
  if (input.id) {
    await prisma.manufacturer.update({
      where: { id: input.id },
      data: { nameAr: input.nameAr, nameEn: input.nameEn || null, country: input.country || null },
    });
  } else {
    await prisma.manufacturer.create({
      data: { nameAr: input.nameAr, nameEn: input.nameEn || null, country: input.country || null },
    });
  }
  revalidatePath("/medicines");
  revalidatePath("/settings");
  return { ok: true };
}
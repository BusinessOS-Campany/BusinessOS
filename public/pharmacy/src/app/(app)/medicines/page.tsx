import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/dal";
import { LANG_COOKIE, localeFrom } from "@/lib/i18n";
import { MedicinesClient } from "@/components/medicines/medicines-client";

export const dynamic = "force-dynamic";

export default async function MedicinesPage() {
  const cookieStore = await cookies();
  const locale = localeFrom(cookieStore.get(LANG_COOKIE)?.value);
  await requirePermission("medicines:view");

  const [medicines, categories, manufacturers, stock] = await Promise.all([
    prisma.medicine.findMany({
      orderBy: { createdAt: "desc" },
    }),
    prisma.category.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.manufacturer.findMany({ orderBy: { nameAr: "asc" } }),
    prisma.stockLevel.groupBy({ by: ["medicineId"], _sum: { qty: true } }),
  ]);

  const stockMap = new Map(stock.map((s) => [s.medicineId, Number(s._sum.qty ?? 0)]));
  const categoryMap = new Map(categories.map((c) => [c.id, c.nameAr]));
  const manufacturerMap = new Map(manufacturers.map((m) => [m.id, m.nameAr]));

  const serialized = medicines.map((m) => ({
    id: m.id,
    nameAr: m.nameAr,
    nameEn: m.nameEn,
    genericName: m.genericName,
    strength: m.strength,
    dosageForm: m.dosageForm,
    medicineType: m.medicineType,
    categoryId: m.categoryId,
    manufacturerId: m.manufacturerId,
    sku: m.sku,
    barcode: m.barcode,
    unit: m.unit,
    minStock: m.minStock ? Number(m.minStock) : null,
    reorderLevel: m.reorderLevel ? Number(m.reorderLevel) : null,
    purchasePrice: Number(m.purchasePrice) / 100,
    salePrice: Number(m.salePrice) / 100,
    wholesalePrice: m.wholesalePrice ? Number(m.wholesalePrice) / 100 : null,
    requiresPrescription: m.requiresPrescription,
    controlled: m.controlled,
    isActive: m.isActive,
    description: m.description,
    categoryName: m.categoryId ? categoryMap.get(m.categoryId) ?? null : null,
    manufacturerName: m.manufacturerId ? manufacturerMap.get(m.manufacturerId) ?? null : null,
    stock: stockMap.get(m.id) ?? 0,
  }));

  return (
    <MedicinesClient
      locale={locale}
      medicines={serialized}
      categories={categories.map((c) => ({ id: c.id, nameAr: c.nameAr, nameEn: c.nameEn }))}
      manufacturers={manufacturers.map((m) => ({ id: m.id, nameAr: m.nameAr, nameEn: m.nameEn }))}
    />
  );
}
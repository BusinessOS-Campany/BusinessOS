import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/dal";
import { LANG_COOKIE, localeFrom } from "@/lib/i18n";
import { InventoryClient } from "@/components/inventory/inventory-client";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const cookieStore = await cookies();
  const locale = localeFrom(cookieStore.get(LANG_COOKIE)?.value);
  await requirePermission("inventory:view");

  const [stocks, medicines, warehouses] = await Promise.all([
    prisma.stockLevel.findMany(),
    prisma.medicine.findMany(),
    prisma.warehouse.findMany(),
  ]);

  const medicineMap = new Map(medicines.map((m) => [m.id, m]));
  const warehouseMap = new Map(warehouses.map((w) => [w.id, w]));

  const rows = stocks.map((s) => {
    const med = medicineMap.get(s.medicineId);
    const reorder = med?.reorderLevel ? Number(med.reorderLevel) : med?.minStock ? Number(med.minStock) : 0;
    return {
      key: `${s.medicineId}:${s.warehouseId}`,
      medicineId: s.medicineId,
      name: med ? (locale === "ar" ? med.nameAr : med.nameEn ?? med.nameAr) : "—",
      barcode: med?.barcode ?? "",
      warehouseId: s.warehouseId,
      warehouse: warehouseMap.get(s.warehouseId) ? (locale === "ar" ? warehouseMap.get(s.warehouseId)!.nameAr : warehouseMap.get(s.warehouseId)!.nameEn ?? warehouseMap.get(s.warehouseId)!.nameAr) : "—",
      qty: Number(s.qty),
      reorder,
      low: Boolean(reorder) && Number(s.qty) < reorder,
    };
  });

  return (
    <InventoryClient
      locale={locale}
      rows={rows}
      warehouses={warehouses.map((w) => ({ id: w.id, name: locale === "ar" ? w.nameAr : w.nameEn ?? w.nameAr }))}
    />
  );
}
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/dal";
import { LANG_COOKIE, localeFrom } from "@/lib/i18n";
import { PurchasesClient } from "@/components/purchases/purchases-client";

export const dynamic = "force-dynamic";

export default async function PurchasesPage() {
  const cookieStore = await cookies();
  const locale = localeFrom(cookieStore.get(LANG_COOKIE)?.value);
  await requirePermission("purchases:view");

  const [purchases, suppliers, medicines, warehouses] = await Promise.all([
    prisma.purchaseOrder.findMany({ orderBy: { orderDate: "desc" }, take: 200 }),
    prisma.supplier.findMany({ where: { isActive: true }, orderBy: { nameAr: "asc" } }),
    prisma.medicine.findMany({ where: { isActive: true }, orderBy: { nameAr: "asc" } }),
    prisma.warehouse.findMany({ where: { isActive: true }, orderBy: { nameAr: "asc" } }),
  ]);

  const supplierMap = new Map(suppliers.map((s) => [s.id, s.name]));
  const items = await prisma.purchaseItem.findMany({ where: { purchaseOrderId: { in: purchases.map((p) => p.id) } } });
  const medicineMap = new Map(medicines.map((m) => [m.id, m.nameEn ?? m.nameAr]));

  const rows = purchases.map((po) => ({
    id: po.id,
    poNumber: po.poNumber,
    supplier: supplierMap.get(po.supplierId) ?? "—",
    orderDate: po.orderDate.toISOString(),
    status: po.status,
    total: Number(po.total) / 100,
    itemCount: items.filter((i) => i.purchaseOrderId === po.id).length,
  }));

  const receivable = items.map((i) => ({
    id: i.id,
    purchaseOrderId: i.purchaseOrderId,
    medicineId: i.medicineId,
    medicineName: medicineMap.get(i.medicineId) ?? "—",
    qty: Number(i.quantity),
    receivedQty: Number(i.receivedQty),
    remaining: Number(i.quantity) - Number(i.receivedQty),
    unitCost: Number(i.unitCost) / 100,
  }));

  return (
    <PurchasesClient
      locale={locale}
      rows={rows}
      suppliers={suppliers.map((s) => ({ id: s.id, name: s.name, nameAr: s.nameAr }))}
      warehouses={warehouses.map((w) => ({ id: w.id, name: w.nameEn ?? w.nameAr }))}
      medicines={medicines.map((m) => ({ id: m.id, name: m.nameEn ?? m.nameAr, nameAr: m.nameAr }))}
      receivable={receivable}
    />
  );
}
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/dal";
import { LANG_COOKIE, localeFrom } from "@/lib/i18n";
import { defaultWarehouse } from "@/lib/inventory";
import { PosClient } from "@/components/pos/pos-client";

export const dynamic = "force-dynamic";

export default async function PosPage() {
  const cookieStore = await cookies();
  const locale = localeFrom(cookieStore.get(LANG_COOKIE)?.value);
  await requirePermission("pos:operate");

  const warehouseId = await defaultWarehouse();
  const [medicines, categories, customers, stock, cashAccounts, holds, setting] = await Promise.all([
    prisma.medicine.findMany({
      where: { isActive: true },
      orderBy: { nameAr: "asc" },
      select: {
        id: true,
        nameAr: true,
        nameEn: true,
        barcode: true,
        sku: true,
        salePrice: true,
        unit: true,
        medicineType: true,
        requiresPrescription: true,
        categoryId: true,
        strength: true,
      },
    }),
    prisma.category.findMany({ where: { isActive: true } }),
    prisma.customer.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, take: 200 }),
    prisma.stockLevel.groupBy({ by: ["medicineId"], _sum: { qty: true } }),
    prisma.cashAccount.findMany({ where: { isActive: true } }),
    prisma.posHold.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.setting.findUnique({ where: { key: "pharmacy" } }),
  ]);

  const stockMap = new Map(stock.map((s) => [s.medicineId, Number(s._sum.qty ?? 0)]));

  const settings = (setting?.value ?? {}) as Record<string, unknown>;

  return (
    <PosClient
      locale={locale}
      warehouseId={warehouseId}
      cashAccounts={cashAccounts.map((c) => ({ id: c.id, nameAr: c.nameAr }))}
      taxRateBps={Number(settings.taxRateBps ?? 0)}
      medicines={medicines.map((m) => ({
        id: m.id,
        nameAr: m.nameAr,
        nameEn: m.nameEn,
        barcode: m.barcode,
        sku: m.sku,
        salePrice: Number(m.salePrice) / 100,
        unit: m.unit,
        strength: m.strength,
        requiresPrescription: m.requiresPrescription,
        categoryId: m.categoryId,
        stock: stockMap.get(m.id) ?? 0,
      }))}
      categories={categories.map((c) => ({ id: c.id, nameAr: c.nameAr }))}
      customers={customers.map((c) => ({ id: c.id, name: c.name, phone: c.phone }))}
      holds={holds.map((h) => ({
        id: h.id,
        label: h.label,
        customerId: h.customerId,
        cart: h.cart,
        createdAt: h.createdAt.toISOString(),
      }))}
    />
  );
}
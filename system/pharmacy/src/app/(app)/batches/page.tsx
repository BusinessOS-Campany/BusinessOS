import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/dal";
import { LANG_COOKIE, localeFrom } from "@/lib/i18n";
import { BatchesClient } from "@/components/batches/batches-client";
import { defaultWarehouse } from "@/lib/inventory";

export const dynamic = "force-dynamic";

export default async function BatchesPage() {
  const cookieStore = await cookies();
  const locale = localeFrom(cookieStore.get(LANG_COOKIE)?.value);
  await requirePermission("batches:view");

  const [batches, medicines, warehouse] = await Promise.all([
    prisma.medicineBatch.findMany({ orderBy: { expiryDate: "asc" }, take: 2000 }),
    prisma.medicine.findMany(),
    defaultWarehouse(),
  ]);

  const medicineMap = new Map(medicines.map((m) => [m.id, m]));

  const rows = batches.map((b) => {
    const med = medicineMap.get(b.medicineId);
    const daysLeft = Math.ceil((b.expiryDate.getTime() - Date.now()) / 86400000);
    return {
      id: b.id,
      name: med ? (locale === "ar" ? med.nameAr : med.nameEn ?? med.nameAr) : "—",
      batchNo: b.batchNo,
      expiry: b.expiryDate.toISOString(),
      daysLeft,
      initial: Number(b.initialQty),
      remaining: Number(b.remainingQty),
      purchasePrice: Number(b.purchasePrice) / 100,
      status: Number(b.remainingQty) === 0 ? ("empty" as const) : daysLeft < 0 ? ("expired" as const) : daysLeft <= 90 ? ("expiring" as const) : ("active" as const),
    };
  });

  return <BatchesClient locale={locale} rows={rows} />;
}
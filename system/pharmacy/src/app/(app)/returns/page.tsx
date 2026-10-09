import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/dal";
import { LANG_COOKIE, localeFrom } from "@/lib/i18n";
import { ReturnsClient } from "@/components/returns/returns-client";

export const dynamic = "force-dynamic";

export default async function ReturnsPage() {
  const cookieStore = await cookies();
  const locale = localeFrom(cookieStore.get(LANG_COOKIE)?.value);
  await requirePermission("returns:view");

  const [invoices, invItems, returnedItems, medicines, suppliers, cashAccounts, batches, salesReturns, supplierReturns] = await Promise.all([
    prisma.salesInvoice.findMany({ where: { status: "posted" }, orderBy: { issuedAt: "desc" } }),
    prisma.salesInvoiceItem.findMany(),
    prisma.salesReturnItem.findMany(),
    prisma.medicine.findMany(),
    prisma.supplier.findMany({ where: { isActive: true }, orderBy: { nameAr: "asc" } }),
    prisma.cashAccount.findMany({ where: { isActive: true } }),
    prisma.medicineBatch.findMany({ where: { remainingQty: { gt: 0 } }, orderBy: { expiryDate: "asc" }, take: 2000 }),
    prisma.salesReturn.findMany({ orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.supplierReturn.findMany({ orderBy: { createdAt: "desc" }, take: 200 }),
  ]);

  const medicineMap = new Map(medicines.map((m) => [m.id, m]));
  const supplierMap = new Map(suppliers.map((s) => [s.id, s.name]));
  const invoiceMap = new Map(invoices.map((i) => [i.id, i]));

  const batchOptions = batches.map((b) => ({
    id: b.id,
    medicineId: b.medicineId,
    name: medicineMap.get(b.medicineId) ? (locale === "ar" ? medicineMap.get(b.medicineId)!.nameAr : medicineMap.get(b.medicineId)!.nameEn ?? medicineMap.get(b.medicineId)!.nameAr) : "—",
    batchNo: b.batchNo,
    remaining: Number(b.remainingQty),
    unitCost: Number(b.purchasePrice) / 100,
  }));

  const invoiceOptions = invoices.map((i) => ({
    id: i.id,
    invoiceNumber: i.invoiceNumber,
    issuedAt: i.issuedAt.toISOString(),
  }));

  const invoiceItemRows = invItems.map((item) => {
    const returnedSoFar = returnedItems.filter((r) => r.medicineId === item.medicineId).reduce((s, r) => s + Number(r.qty), 0);
    return {
      id: item.id,
      invoiceId: item.invoiceId,
      medicineId: item.medicineId,
      batchId: item.batchId,
      name: medicineMap.get(item.medicineId) ? (locale === "ar" ? medicineMap.get(item.medicineId)!.nameAr : medicineMap.get(item.medicineId)!.nameEn ?? medicineMap.get(item.medicineId)!.nameAr) : "—",
      qty: Number(item.qty),
      maxReturn: Math.max(0, Number(item.qty) - returnedSoFar),
      unitPrice: Number(item.unitPrice) / 100,
    };
  });

  const salesReturnRows = salesReturns.map((r) => {
    const inv = invoiceMap.get(r.invoiceId);
    return {
      id: r.id,
      returnNumber: r.returnNumber,
      invoiceNumber: inv?.invoiceNumber ?? "—",
      total: Number(r.total) / 100,
      reason: r.reason ?? "—",
      createdAt: r.createdAt.toISOString(),
    };
  });

  const supplierReturnRows = supplierReturns.map((r) => ({
    id: r.id,
    returnNumber: r.returnNumber,
    supplier: supplierMap.get(r.supplierId) ?? "—",
    total: Number(r.total) / 100,
    reason: r.reason,
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <ReturnsClient
      locale={locale}
      invoices={invoiceOptions}
      invoiceItems={invoiceItemRows}
      suppliers={suppliers.map((s) => ({ id: s.id, name: s.name, nameAr: s.nameAr }))}
      cashAccounts={cashAccounts.map((c) => ({ id: c.id, name: c.nameEn ?? c.nameAr }))}
      batchOptions={batchOptions}
      salesReturns={salesReturnRows}
      supplierReturns={supplierReturnRows}
    />
  );
}
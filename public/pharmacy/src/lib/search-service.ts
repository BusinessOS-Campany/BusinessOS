import "server-only";
import { prisma } from "@/lib/prisma";
import type { Locale } from "@/lib/i18n";
import type { SearchGroup } from "@/lib/search-types";

export async function searchGroups(query: string, locale: Locale): Promise<SearchGroup[]> {
  const q = query.trim();
  if (!q) return [];

  const contains = { contains: q, mode: "insensitive" as const };

  const [medicines, customers, suppliers, invoices, prescriptions] = await Promise.all([
    prisma.medicine.findMany({ where: { OR: [{ nameAr: contains }, { nameEn: contains }, { barcode: contains }, { sku: contains }] }, take: 20 }),
    prisma.customer.findMany({ where: { OR: [{ name: contains }, { phone: contains }] }, take: 20 }),
    prisma.supplier.findMany({ where: { OR: [{ name: contains }, { nameAr: contains }, { phone: contains }] }, take: 20 }),
    prisma.salesInvoice.findMany({ where: { invoiceNumber: contains }, take: 20 }),
    prisma.prescription.findMany({ where: { prescriptionNo: contains }, take: 20 }),
  ]);

  const groups: SearchGroup[] = [];
  if (medicines.length) groups.push({
    title: locale === "ar" ? "الأدوية" : "Medicines",
    hrefPrefix: "/medicines",
    items: medicines.map((m) => ({ id: m.id, label: m.nameAr, sub: m.nameEn ?? m.barcode ?? undefined })),
  });
  if (customers.length) groups.push({
    title: locale === "ar" ? "العملاء" : "Customers",
    hrefPrefix: "/customers",
    items: customers.map((c) => ({ id: c.id, label: c.name, sub: c.phone ?? undefined })),
  });
  if (suppliers.length) groups.push({
    title: locale === "ar" ? "الموردون" : "Suppliers",
    hrefPrefix: "/suppliers",
    items: suppliers.map((s) => ({ id: s.id, label: s.nameAr ?? s.name, sub: s.phone ?? undefined })),
  });
  if (invoices.length) groups.push({
    title: locale === "ar" ? "الفواتير" : "Invoices",
    hrefPrefix: "/sales",
    items: invoices.map((i) => ({ id: i.id, label: i.invoiceNumber, sub: i.issuedAt.toLocaleDateString(locale === "ar" ? "ar-YE" : "en-GB") })),
  });
  if (prescriptions.length) groups.push({
    title: locale === "ar" ? "الوصفات" : "Prescriptions",
    hrefPrefix: "/prescriptions",
    items: prescriptions.map((p) => ({ id: p.id, label: p.prescriptionNo, sub: p.issueDate.toLocaleDateString(locale === "ar" ? "ar-YE" : "en-GB") })),
  });

  return groups;
}
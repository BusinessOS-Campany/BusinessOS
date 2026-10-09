import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/dal";
import { LANG_COOKIE, localeFrom } from "@/lib/i18n";
import { PrescriptionsClient } from "@/components/prescriptions/prescriptions-client";

export const dynamic = "force-dynamic";

export default async function PrescriptionsPage() {
  const cookieStore = await cookies();
  const locale = localeFrom(cookieStore.get(LANG_COOKIE)?.value);
  await requirePermission("prescriptions:view");

  const [prescriptions, rxs, medicines, customers, doctors] = await Promise.all([
    prisma.prescription.findMany({ orderBy: { issueDate: "desc" }, take: 300 }),
    prisma.prescriptionItem.findMany({ take: 3000 }),
    prisma.medicine.findMany({ where: { isActive: true }, orderBy: { nameAr: "asc" } }),
    prisma.customer.findMany(),
    prisma.doctor.findMany(),
  ]);

  const customerMap = new Map(customers.map((c) => [c.id, c.name]));
  const doctorMap = new Map(doctors.map((d) => [d.id, d.name]));
  const itemGroups = new Map<string, Array<{ name: string; qty: number; dispensed: number }>>();
  for (const rx of rxs) {
    const arr = itemGroups.get(rx.prescriptionId) ?? [];
    arr.push({ name: rx.medicineName, qty: Number(rx.quantity ?? 0), dispensed: Number(rx.dispensedQty) });
    itemGroups.set(rx.prescriptionId, arr);
  }

  const rows = prescriptions.map((rx) => ({
    id: rx.id,
    prescriptionNo: rx.prescriptionNo,
    customer: rx.customerId ? customerMap.get(rx.customerId) ?? "—" : "—",
    doctor: rx.doctorId ? doctorMap.get(rx.doctorId) ?? "—" : "—",
    issueDate: rx.issueDate.toISOString(),
    status: rx.status,
    itemCount: (itemGroups.get(rx.id) ?? []).length,
    summary: (itemGroups.get(rx.id) ?? []).map((i) => `${i.name} (${i.dispensed}/${i.qty})`).join(", "),
  }));

  return (
    <PrescriptionsClient
      locale={locale}
      rows={rows}
      medicines={medicines.map((m) => ({ id: m.id, name: m.nameEn ?? m.nameAr, nameAr: m.nameAr }))}
      customers={customers.map((c) => ({ id: c.id, name: c.name }))}
      doctors={doctors.map((d) => ({ id: d.id, name: d.name, specialty: d.specialty }))}
    />
  );
}
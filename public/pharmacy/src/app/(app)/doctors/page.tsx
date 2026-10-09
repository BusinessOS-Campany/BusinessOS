import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/dal";
import { LANG_COOKIE, localeFrom } from "@/lib/i18n";
import { ResourceTable } from "@/components/resource-table";
import { saveDoctor, deleteDoctor } from "@/lib/actions/doctors";

export const dynamic = "force-dynamic";

export default async function DoctorsPage() {
  const cookieStore = await cookies();
  const locale = localeFrom(cookieStore.get(LANG_COOKIE)?.value);
  await requirePermission("doctors:view");

  const doctors = await prisma.doctor.findMany({ orderBy: { createdAt: "desc" } });
  const rows = doctors.map((d) => ({
    id: d.id,
    name: d.name,
    specialty: d.specialty,
    phone: d.phone,
    clinic: d.clinic,
    hospital: d.hospital,
    isActive: d.isActive,
  }));

  return (
    <ResourceTable
      locale={locale}
      title={locale === "ar" ? "الأطباء" : "Doctors"}
      description={locale === "ar" ? "إدارة الأطباء والتخصصات" : "Manage doctors and specialties"}
      createLabel={locale === "ar" ? "طبيب جديد" : "New doctor"}
      emptyTitle={locale === "ar" ? "لا يوجد أطباء" : "No doctors"}
      searchKeys={["name", "specialty", "phone", "clinic", "hospital"]}
      rows={rows}
      saveAction={saveDoctor as (v: Record<string, unknown>) => Promise<{ ok: boolean }>}
      deleteAction={deleteDoctor}
      fields={[
        { key: "name", label: locale === "ar" ? "الاسم" : "Name", type: "text", required: true },
        { key: "specialty", label: locale === "ar" ? "التخصص" : "Specialty", type: "text" },
        { key: "phone", label: locale === "ar" ? "الهاتف" : "Phone", type: "text" },
        { key: "clinic", label: locale === "ar" ? "العيادة" : "Clinic", type: "text" },
        { key: "hospital", label: locale === "ar" ? "المستشفى" : "Hospital", type: "text" },
        { key: "licenseNo", label: locale === "ar" ? "رقم الترخيص" : "License no", type: "text" },
        { key: "isActive", label: locale === "ar" ? "نشط" : "Active", type: "switch", defaultValue: true },
        { key: "notes", label: locale === "ar" ? "ملاحظات" : "Notes", type: "textarea" },
      ]}
      columns={[
        { key: "name", label: locale === "ar" ? "الطبيب" : "Doctor" },
        { key: "specialty", label: locale === "ar" ? "التخصص" : "Specialty" },
        { key: "clinic", label: locale === "ar" ? "العيادة" : "Clinic" },
        { key: "hospital", label: locale === "ar" ? "المستشفى" : "Hospital" },
        { key: "phone", label: locale === "ar" ? "الهاتف" : "Phone" },
        { key: "isActive", label: locale === "ar" ? "الحالة" : "Status", format: "boolean" },
      ]}
    />
  );
}
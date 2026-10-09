import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/dal";
import { LANG_COOKIE, localeFrom } from "@/lib/i18n";
import { ResourceTable } from "@/components/resource-table";
import { saveSupplier, deleteSupplier } from "@/lib/actions/suppliers";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const cookieStore = await cookies();
  const locale = localeFrom(cookieStore.get(LANG_COOKIE)?.value);
  await requirePermission("suppliers:view");

  const suppliers = await prisma.supplier.findMany({ orderBy: { createdAt: "desc" } });
  const rows = suppliers.map((s) => ({
    id: s.id,
    name: s.name,
    nameAr: s.nameAr,
    phone: s.phone,
    governorate: s.governorate,
    city: s.city,
    balance: Number(s.balance) / 100,
    isActive: s.isActive,
  }));

  return (
    <ResourceTable
      locale={locale}
      title={locale === "ar" ? "الموردون" : "Suppliers"}
      description={locale === "ar" ? "إدارة الموردين وأرصدتهم" : "Manage suppliers and balances"}
      createLabel={locale === "ar" ? "مورد جديد" : "New supplier"}
      emptyTitle={locale === "ar" ? "لا يوجد موردون" : "No suppliers"}
      emptyDescription={locale === "ar" ? "أضف أول مورد." : "Add your first supplier."}
      searchKeys={["name", "nameAr", "phone", "governorate", "city"]}
      rows={rows}
      saveAction={saveSupplier as (v: Record<string, unknown>) => Promise<{ ok: boolean }>}
      deleteAction={deleteSupplier}
      fields={[
        { key: "name", label: locale === "ar" ? "الاسم (إنجليزي)" : "Name (English)", type: "text", required: true },
        { key: "nameAr", label: locale === "ar" ? "الاسم (عربي)" : "Name (Arabic)", type: "text" },
        { key: "contactPerson", label: locale === "ar" ? "جهة الاتصال" : "Contact person", type: "text" },
        { key: "phone", label: locale === "ar" ? "الهاتف" : "Phone", type: "text" },
        { key: "email", label: locale === "ar" ? "البريد الإلكتروني" : "Email", type: "text" },
        { key: "governorate", label: locale === "ar" ? "المحافظة" : "Governorate", type: "text" },
        { key: "city", label: locale === "ar" ? "المدينة" : "City", type: "text" },
        { key: "address", label: locale === "ar" ? "العنوان" : "Address", type: "text" },
        { key: "taxNumber", label: locale === "ar" ? "الرقم الضريبي" : "Tax number", type: "text" },
        { key: "paymentTerms", label: locale === "ar" ? "شروط الدفع" : "Payment terms", type: "text" },
        { key: "creditLimit", label: locale === "ar" ? "سقف الائتمان" : "Credit limit", type: "money", defaultValue: 0 },
        { key: "isActive", label: locale === "ar" ? "نشط" : "Active", type: "switch", defaultValue: true },
        { key: "notes", label: locale === "ar" ? "ملاحظات" : "Notes", type: "textarea" },
      ]}
      columns={[
        { key: "name", label: locale === "ar" ? "المورد" : "Supplier", subKey: "nameAr" },
        { key: "governorate", label: locale === "ar" ? "المحافظة" : "Governorate" },
        { key: "phone", label: locale === "ar" ? "الهاتف" : "Phone" },
        { key: "balance", label: locale === "ar" ? "الرصيد" : "Balance", format: "money", align: "end" },
        { key: "isActive", label: locale === "ar" ? "الحالة" : "Status", format: "boolean" },
      ]}
    />
  );
}
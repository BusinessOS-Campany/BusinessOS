import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/dal";
import { LANG_COOKIE, localeFrom } from "@/lib/i18n";
import { ResourceTable } from "@/components/resource-table";
import { saveCustomer, deleteCustomer } from "@/lib/actions/customers";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const cookieStore = await cookies();
  const locale = localeFrom(cookieStore.get(LANG_COOKIE)?.value);
  await requirePermission("customers:view");

  const customers = await prisma.customer.findMany({ orderBy: { createdAt: "desc" } });
  const rows = customers.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    address: c.address,
    gender: c.gender,
    balance: Number(c.balance) / 100,
    isActive: c.isActive,
  }));

  return (
    <ResourceTable
      locale={locale}
      title={locale === "ar" ? "العملاء" : "Customers"}
      description={locale === "ar" ? "إدارة العملاء وأرصدتهم" : "Manage customers and balances"}
      createLabel={locale === "ar" ? "عميل جديد" : "New customer"}
      emptyTitle={locale === "ar" ? "لا يوجد عملاء" : "No customers"}
      emptyDescription={locale === "ar" ? "أضف أول عميل." : "Add your first customer."}
      searchKeys={["name", "phone", "address"]}
      rows={rows}
      saveAction={saveCustomer as (v: Record<string, unknown>) => Promise<{ ok: boolean }>}
      deleteAction={deleteCustomer}
      fields={[
        { key: "name", label: locale === "ar" ? "الاسم" : "Name", type: "text", required: true },
        { key: "phone", label: locale === "ar" ? "الهاتف" : "Phone", type: "text" },
        { key: "address", label: locale === "ar" ? "العنوان" : "Address", type: "text" },
        { key: "gender", label: locale === "ar" ? "الجنس" : "Gender", type: "select", options: [{ value: "", label: "—" }, { value: "male", label: locale === "ar" ? "ذكر" : "Male" }, { value: "female", label: locale === "ar" ? "أنثى" : "Female" }] },
        { key: "creditLimit", label: locale === "ar" ? "سقف الائتمان" : "Credit limit", type: "money", defaultValue: 0 },
        { key: "isActive", label: locale === "ar" ? "نشط" : "Active", type: "switch", defaultValue: true },
        { key: "notes", label: locale === "ar" ? "ملاحظات" : "Notes", type: "textarea" },
      ]}
      columns={[
        { key: "name", label: locale === "ar" ? "العميل" : "Customer" },
        { key: "phone", label: locale === "ar" ? "الهاتف" : "Phone" },
        { key: "address", label: locale === "ar" ? "العنوان" : "Address" },
        { key: "balance", label: locale === "ar" ? "الرصيد" : "Balance", format: "money", align: "end" },
        { key: "isActive", label: locale === "ar" ? "الحالة" : "Status", format: "boolean" },
      ]}
    />
  );
}
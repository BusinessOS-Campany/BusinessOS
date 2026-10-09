import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/dal";
import { LANG_COOKIE, localeFrom } from "@/lib/i18n";
import { ResourceTable } from "@/components/resource-table";
import { saveEmployee, deleteEmployee } from "@/lib/actions/employees";
import { ALL_ROLE_KEYS, ROLE_NAME, ROLE_NAME_AR } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
  const cookieStore = await cookies();
  const locale = localeFrom(cookieStore.get(LANG_COOKIE)?.value);
  await requirePermission("employees:view");

  const employees = await prisma.employee.findMany({ orderBy: { createdAt: "desc" } });
  const rows = employees.map((e) => ({
    id: e.id,
    name: e.name,
    nameAr: e.nameAr,
    phone: e.phone,
    email: e.email,
    role: e.role,
    roleAr: ROLE_NAME_AR[e.role as keyof typeof ROLE_NAME_AR] ?? e.role,
    salary: e.salary ? Number(e.salary) / 100 : null,
    hireDate: e.hireDate ? e.hireDate.toISOString() : null,
    isActive: e.isActive,
  }));

  return (
    <ResourceTable
      locale={locale}
      title={locale === "ar" ? "الموظفون" : "Employees"}
      description={locale === "ar" ? "إدارة الموظفين والصلاحيات" : "Manage employees and roles"}
      createLabel={locale === "ar" ? "موظف جديد" : "New employee"}
      emptyTitle={locale === "ar" ? "لا يوجد موظفون" : "No employees"}
      searchKeys={["name", "nameAr", "phone", "email", "role"]}
      rows={rows}
      saveAction={saveEmployee as (v: Record<string, unknown>) => Promise<{ ok: boolean }>}
      deleteAction={deleteEmployee}
      fields={[
        { key: "name", label: locale === "ar" ? "الاسم (إنجليزي)" : "Name (English)", type: "text", required: true },
        { key: "nameAr", label: locale === "ar" ? "الاسم (عربي)" : "Name (Arabic)", type: "text" },
        { key: "phone", label: locale === "ar" ? "الهاتف" : "Phone", type: "text" },
        { key: "email", label: locale === "ar" ? "البريد الإلكتروني" : "Email", type: "text" },
        { key: "role", label: locale === "ar" ? "الدور" : "Role", type: "select", required: true, options: ALL_ROLE_KEYS.map((r) => ({ value: r, label: locale === "ar" ? ROLE_NAME_AR[r] : ROLE_NAME[r] })) },
        { key: "salary", label: locale === "ar" ? "الراتب" : "Salary", type: "money", defaultValue: 0 },
        { key: "hireDate", label: locale === "ar" ? "تاريخ التعيين" : "Hire date", type: "text", placeholder: "YYYY-MM-DD" },
        { key: "isActive", label: locale === "ar" ? "نشط" : "Active", type: "switch", defaultValue: true },
        { key: "notes", label: locale === "ar" ? "ملاحظات" : "Notes", type: "textarea" },
      ]}
      columns={[
        { key: "name", label: locale === "ar" ? "الموظف" : "Employee", subKey: "nameAr" },
        { key: "roleAr", label: locale === "ar" ? "الدور" : "Role", format: "badge" },
        { key: "phone", label: locale === "ar" ? "الهاتف" : "Phone" },
        { key: "salary", label: locale === "ar" ? "الراتب" : "Salary", format: "money", align: "end" },
        { key: "hireDate", label: locale === "ar" ? "التعيين" : "Hired", format: "date" },
        { key: "isActive", label: locale === "ar" ? "الحالة" : "Status", format: "boolean" },
      ]}
    />
  );
}
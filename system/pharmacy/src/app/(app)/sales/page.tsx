import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/dal";
import { LANG_COOKIE, localeFrom } from "@/lib/i18n";
import { SalesListClient } from "@/components/sales/sales-list-client";

export const dynamic = "force-dynamic";

export default async function SalesListPage() {
  const cookieStore = await cookies();
  const locale = localeFrom(cookieStore.get(LANG_COOKIE)?.value);
  await requirePermission("sales:view");

  const [invoices, customers, users] = await Promise.all([
    prisma.salesInvoice.findMany({ orderBy: { issuedAt: "desc" }, take: 500 }),
    prisma.customer.findMany(),
    prisma.user.findMany(),
  ]);
  const customerMap = new Map(customers.map((c) => [c.id, c.name]));
  const userMap = new Map(users.map((u) => [u.id, u.name]));

  const rows = invoices.map((i) => ({
    id: i.id,
    invoiceNumber: i.invoiceNumber,
    customer: i.customerId ? customerMap.get(i.customerId) ?? "—" : locale === "ar" ? "زبون نقدي" : "Walk-in",
    issuedAt: i.issuedAt.toISOString(),
    status: i.status,
    paymentMethod: i.paymentMethod,
    total: Number(i.total) / 100,
    paid: Number(i.paidTotal) / 100,
    createdBy: i.createdByUserId ? userMap.get(i.createdByUserId) ?? "—" : "—",
  }));

  return <SalesListClient locale={locale} rows={rows} />;
}
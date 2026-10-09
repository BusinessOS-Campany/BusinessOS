import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/dal";
import { LANG_COOKIE, localeFrom } from "@/lib/i18n";
import { NotificationsClient } from "@/components/notifications/notifications-client";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const cookieStore = await cookies();
  const locale = localeFrom(cookieStore.get(LANG_COOKIE)?.value);
  await requirePermission("notifications:view");

  const notifications = await prisma.notification.findMany({ where: { userId: null }, orderBy: { createdAt: "desc" }, take: 200 });

  const rows = notifications.map((n) => ({
    id: n.id,
    title: locale === "ar" ? n.titleAr : n.titleEn,
    body: locale === "ar" ? n.bodyAr ?? n.bodyEn ?? "—" : n.bodyEn ?? n.bodyAr ?? "—",
    href: n.href ?? null,
    isRead: n.isRead,
    createdAt: n.createdAt.toISOString(),
  }));

  return <NotificationsClient locale={locale} rows={rows} />;
}
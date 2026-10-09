import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/dal";
import { LANG_COOKIE, localeFrom } from "@/lib/i18n";
import { SettingsClient } from "@/components/settings/settings-client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const cookieStore = await cookies();
  const locale = localeFrom(cookieStore.get(LANG_COOKIE)?.value);
  await requirePermission("settings:view");

  const [setting, branches, warehouses, cashAccounts] = await Promise.all([
    prisma.setting.findUnique({ where: { key: "pharmacy" } }),
    prisma.branch.findMany(),
    prisma.warehouse.findMany(),
    prisma.cashAccount.findMany(),
  ]);

  const value = (typeof setting?.value === "object" && setting.value ? setting.value : {}) as Record<string, unknown>;

  return (
    <SettingsClient
      locale={locale}
      pharmacy={{
        nameAr: String(value.nameAr ?? ""),
        nameEn: String(value.nameEn ?? ""),
        phone: String(value.phone ?? ""),
        email: String(value.email ?? ""),
        address: String(value.address ?? ""),
        taxNumber: String(value.taxNumber ?? ""),
        taxRateBps: Number(value.taxRateBps ?? 0),
        expiryWarningDays: Number(value.expiryWarningDays ?? 60),
      }}
      branches={branches.map((b) => ({ id: b.id, name: locale === "ar" ? b.nameAr : b.nameEn ?? b.nameAr, isActive: b.isActive }))}
      warehouses={warehouses.map((w) => ({ id: w.id, name: locale === "ar" ? w.nameAr : w.nameEn ?? w.nameAr, isMain: w.isMain, isActive: w.isActive }))}
      cashAccounts={cashAccounts.map((c) => ({ id: c.id, name: c.nameEn ?? c.nameAr, type: c.type, isActive: c.isActive }))}
    />
  );
}
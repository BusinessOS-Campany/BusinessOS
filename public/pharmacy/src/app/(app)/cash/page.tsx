import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/dal";
import { LANG_COOKIE, localeFrom } from "@/lib/i18n";
import { CashClient } from "@/components/cash/cash-client";

export const dynamic = "force-dynamic";

export default async function CashPage() {
  const cookieStore = await cookies();
  const locale = localeFrom(cookieStore.get(LANG_COOKIE)?.value);
  await requirePermission("cash:view");

  const [accounts, sessions, movements] = await Promise.all([
    prisma.cashAccount.findMany({ orderBy: { nameAr: "asc" } }),
    prisma.cashSession.findMany({ orderBy: { openedAt: "desc" } }),
    prisma.cashMovement.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
  ]);

  return (
    <CashClient
      locale={locale}
      accounts={accounts.map((a) => ({ id: a.id, name: a.nameEn ?? a.nameAr, type: a.type, isActive: a.isActive }))}
      sessions={sessions.map((s) => ({
        id: s.id,
        cashAccountId: s.cashAccountId,
        status: s.status,
        openingBalance: Number(s.openingBalance) / 100,
        closingBalance: s.closingBalance != null ? Number(s.closingBalance) / 100 : null,
        actualBalance: s.actualBalance != null ? Number(s.actualBalance) / 100 : null,
        discrepancy: s.discrepancy != null ? Number(s.discrepancy) / 100 : null,
        openedAt: s.openedAt.toISOString(),
      }))}
      movements={movements.map((m) => ({
        id: m.id,
        cashAccountId: m.cashAccountId,
        delta: Number(m.delta) / 100,
        reason: m.reason,
        note: m.note ?? "—",
        createdAt: m.createdAt.toISOString(),
      }))}
    />
  );
}
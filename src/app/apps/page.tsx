import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/core/auth/server";
import { prisma } from "@/core/db/client";
import { getCustomerMarketplace } from "@/core/apps/service";
import { getDictAndDir } from "@/core/i18n/server";
import { t } from "@/core/i18n/dictionaries";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { AppMarketplace } from "@/components/apps/app-marketplace";

export const dynamic = "force-dynamic";

/**
 * Customer system marketplace.
 * Single central catalog (the `app` registry table) rendered per-tenant:
 * state per card = unavailable / installed / pending-approval (legacy) /
 * demo / installable. Installation is SELF-SERVICE and instant — no platform
 * approval queue; disabled catalog systems are the only blocked path.
 */
export default async function AppsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/signin");

  const activeOrgId = session.session.activeOrganizationId;
  if (!activeOrgId) redirect("/select-org");

  const { dict, locale, dir } = await getDictAndDir();
  const d = (key: string) => t(dict, `platform.marketplace.${key}`);

  const [marketplace, org, pendingCount] = await Promise.all([
    getCustomerMarketplace(activeOrgId, session.user.id),
    prisma.organization.findUnique({
      where: { id: activeOrgId },
      select: { name: true, slug: true, logo: true },
    }),
    prisma.organizationAppRequest.count({
      where: { organizationId: activeOrgId, status: "pending" },
    }),
  ]);

  return (
    <OnboardingShell>
      <main className="min-h-[calc(100vh-4rem)]" dir={dir}>
        <div className="mx-auto max-w-6xl px-4 py-10">
          <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
            <div className="mb-2 flex items-center gap-3">
              {org?.logo && <img src={org.logo} alt="" className="h-10 w-10 rounded-lg object-cover" />}
              <div>
                <h1 className="text-2xl font-bold text-white">{org?.name ?? ""} — {d("titleSuffix")}</h1>
                <p className="text-sm text-white/50">{d("subtitle")}</p>
              </div>
            </div>
            <div className="w-36">
              <LocaleSwitcher current={locale} />
            </div>
          </header>

          {pendingCount > 0 && (
            <div className="mb-6 flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
              <span className="text-lg">⏳</span>
              <span>
                {locale === "ar" ? `لديك ${pendingCount} ` : `You have ${pendingCount} `}
                {d("pendingBanner")}
              </span>
            </div>
          )}

          <AppMarketplace initialApps={marketplace} dict={dict} locale={locale} />
        </div>
      </main>
    </OnboardingShell>
  );
}

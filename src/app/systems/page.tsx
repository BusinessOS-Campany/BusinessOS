import { headers } from "next/headers";
import Link from "next/link";
import { auth } from "@/core/auth/server";
import { prisma } from "@/core/db/client";
import { BUSINESS_SYSTEMS } from "@/core/demo/business-systems-data";
import { listSystemSources } from "@/core/org-vault/system-sources";
import { installableCardIds, openRouteForOrgSlug } from "@/core/systems/catalog";
import {
  BusinessSystemsSection,
  type SystemCardState,
} from "@/components/demo/business-systems-section";
import { getDictAndDir, t } from "@/core/i18n/server";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";

export const dynamic = "force-dynamic";

/**
 * Per-card install state for the signed-in visitor's own organization.
 *
 * The catalog grid is a promise, and only the deployment can say which promises
 * it can keep: a card is installable only if it has an active `app` row *and* a
 * source under `system/`. Everything else keeps rendering as a coming-soon
 * card rather than filing a request that cannot succeed.
 *
 * Installed and pending are read per-organization, so a card reflects what this
 * tenant has actually asked for — the same rows `/{org}/profile?tab=systems`
 * shows, which is what makes the approval visible in one place.
 */
async function cardStatesFor(
  organizationId: string | null,
  orgSlug: string | null,
): Promise<{ states: Record<string, SystemCardState>; installableCount: number }> {
  const states: Record<string, SystemCardState> = {};
  if (!organizationId) return { states, installableCount: 0 };

  const cardIds = BUSINESS_SYSTEMS.map((s) => s.id);

  const [apps, installed, pending] = await Promise.all([
    prisma.app.findMany({
      where: { slug: { in: cardIds }, isActive: true },
      select: { slug: true },
    }),
    prisma.organizationApp.findMany({
      where: { organizationId, app: { slug: { in: cardIds } } },
      select: { app: { select: { slug: true } } },
    }),
    prisma.organizationAppRequest.findMany({
      where: { organizationId, status: "pending", app: { slug: { in: cardIds } } },
      select: { app: { select: { slug: true } } },
    }),
  ]);

  const installedIds = new Set(installed.map((r) => r.app.slug));
  const pendingIds = new Set(pending.map((r) => r.app.slug));
  const sourceSlugs = listSystemSources();
  const installable = installableCardIds({
    cardIds,
    activeSlugs: apps.map((a) => a.slug),
    sourceSlugs,
  });

  for (const id of cardIds) {
    // A pending request outranks nothing else: the tenant already asked, so the
    // card's job is to say "waiting", not to offer the button again.
    if (installedIds.has(id)) {
      states[id] = { state: "installed", route: openRouteForOrgSlug(id, orgSlug, sourceSlugs) };
    } else if (pendingIds.has(id)) {
      states[id] = { state: "pending" };
    } else if (installable.has(id)) {
      states[id] = { state: "installable" };
    }
  }
  return { states, installableCount: installable.size };
}

export default async function OnboardingPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const organizationId = session?.session.activeOrganizationId ?? null;
  const hasActiveOrg = !!organizationId;
  const { dict, locale, dir } = await getDictAndDir();
  const d = (key: string) => t(dict, `platform.catalog.${key}`);

  const org = organizationId
    ? await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { slug: true },
      })
    : null;

  const { states, installableCount } = await cardStatesFor(organizationId, org?.slug ?? null);

  return (
    <OnboardingShell>
      <main className="min-h-[calc(100vh-4rem)]" dir={dir}>
        <div className="mx-auto max-w-6xl px-4 pt-16 pb-10 sm:px-6">
        {/* Hero */}
        <div className="mb-12 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 py-1.5 text-sm text-primary">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            Business OS
          </div>
          <h1 className="text-4xl font-bold text-white">{d("pageTitle")}</h1>
          <p className="mt-3 text-lg text-white/60">{d("pageSubtitle")}</p>
          <p className="mt-1 text-sm text-white/50">
            {hasActiveOrg ? d("pageInstallDirect") : d("pageInstallLater")}
          </p>
          {/* How many of the catalog this deployment can actually serve. Without
              it, a grid of 173 systems with one install button reads as a bug
              rather than as a deployment fact. */}
          <p className="mt-3 text-xs text-white/40">
            {d("capacity").replace("{count}", String(installableCount)).replace("{total}", String(BUSINESS_SYSTEMS.length))}
            {" · "}
            <Link href="/demo" className="underline hover:text-white/70">{d("capacityBrowse")}</Link>
          </p>
        </div>

        {/* Same catalog component the /demo page renders, so the cards, search,
            category pills and sort control are the same code on both pages. */}
        <BusinessSystemsSection states={states} dict={dict} locale={locale} />

        {/* Info */}
        <div className="mt-12 rounded-xl border border-white/[0.08] bg-white/[0.03] p-6 backdrop-blur-xl">
          <h3 className="font-semibold text-white">{d("howTitle")}</h3>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">1</span>
              <div>
                <p className="font-medium text-white">{d("step1Title")}</p>
                <p className="text-sm text-white/60">{d("step1Desc")}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">2</span>
              <div>
                <p className="font-medium text-white">
                  {hasActiveOrg ? d("step2TitleSignedIn") : d("step2TitleSignedOut")}
                </p>
                <p className="text-sm text-white/60">
                  {hasActiveOrg ? d("step2DescSignedIn") : d("step2DescSignedOut")}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">3</span>
              <div>
                <p className="font-medium text-white">{d("step3Title")}</p>
                <p className="text-sm text-white/60">
                  {hasActiveOrg ? d("step3DescSignedIn") : d("step3DescSignedOut")}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Login / Dashboard link */}
        <div className="mt-8 text-center">
          <Link
            href={hasActiveOrg ? "/my-apps" : "/signin"}
            className="text-sm text-white/60 hover:text-white"
          >
            {hasActiveOrg ? d("backToApps") : d("haveAccount")}
          </Link>
        </div>
      </div>
    </main>
    </OnboardingShell>
  );
}

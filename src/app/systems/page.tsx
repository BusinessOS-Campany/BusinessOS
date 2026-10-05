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
): Promise<Record<string, SystemCardState>> {
  const states: Record<string, SystemCardState> = {};
  if (!organizationId) return states;

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
  const installable = installableCardIds({
    cardIds,
    activeSlugs: apps.map((a) => a.slug),
    sourceSlugs: listSystemSources(),
  });

  for (const id of cardIds) {
    // A pending request outranks nothing else: the tenant already asked, so the
    // card's job is to say "waiting", not to offer the button again.
    if (installedIds.has(id)) {
      states[id] = { state: "installed", route: openRouteForOrgSlug(id, orgSlug) };
    } else if (pendingIds.has(id)) {
      states[id] = { state: "pending" };
    } else if (installable.has(id)) {
      states[id] = { state: "installable" };
    }
  }
  return states;
}

export default async function OnboardingPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const organizationId = session?.session.activeOrganizationId ?? null;
  const hasActiveOrg = !!organizationId;

  const org = organizationId
    ? await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { slug: true },
      })
    : null;

  const states = await cardStatesFor(organizationId, org?.slug ?? null);

  return (
    <OnboardingShell>
      <main className="min-h-[calc(100vh-4rem)]" dir="rtl">
        <div className="mx-auto max-w-6xl px-4 pt-16 pb-10 sm:px-6">
        {/* Hero */}
        <div className="mb-12 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 py-1.5 text-sm text-primary">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            Business OS
          </div>
          <h1 className="text-4xl font-bold text-white">ما نوع نشاطك التجاري؟</h1>
          <p className="mt-3 text-lg text-white/60">
            اختر نظامك وسنقوم بإعداده لك تلقائياً
          </p>
          <p className="mt-1 text-sm text-white/50">
            {hasActiveOrg
              ? "سنثبّت النظام على مؤسستك الحالية مباشرة"
              : "يمكنك تثبيت تطبيقات إضافة لاحقاً من متجر التطبيقات"}
          </p>
        </div>

        {/* Same catalog component the /demo page renders, so the cards, search,
            category pills and sort control are the same code on both pages. */}
        <BusinessSystemsSection states={states} />

        {/* Info */}
        <div className="mt-12 rounded-xl border border-white/[0.08] bg-white/[0.03] p-6 backdrop-blur-xl">
          <h3 className="font-semibold text-white">كيف يعمل Business OS؟</h3>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">1</span>
              <div>
                <p className="font-medium text-white">اختر نوع النشاط</p>
                <p className="text-sm text-white/60">نحدّد النظام المناسب لنشاطك</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">2</span>
              <div>
                <p className="font-medium text-white">
                  {hasActiveOrg ? "نرسل طلب التثبيت" : "نُنشئ حسابك"}
                </p>
                <p className="text-sm text-white/60">
                  {hasActiveOrg
                    ? "تراجع المنصة الطلب قبل تفعيل النظام"
                    : "يتم إعداد المؤسسة والتطبيق تلقائياً"}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">3</span>
              <div>
                <p className="font-medium text-white">ابدأ العمل فوراً</p>
                <p className="text-sm text-white/60">
                  {hasActiveOrg
                    ? "يظهر النظام في تبويب أنظمة ملفك بعد الموافقة"
                    : "ادخل إلى نظامك الجاهز واستخدمه"}
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
            {hasActiveOrg
              ? "العودة إلى تطبيقاتي"
              : "لديك حساب بالفعل؟ تسجيل الدخول"}
          </Link>
        </div>
      </div>
    </main>
    </OnboardingShell>
  );
}

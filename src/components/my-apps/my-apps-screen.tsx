import { headers } from "next/headers";
import Link from "next/link";
import { auth } from "@/core/auth/server";
import { prisma } from "@/core/db/client";
import { getCustomerMarketplace } from "@/core/apps/service";
import { getDictAndDir } from "@/core/i18n/server";
import { t } from "@/core/i18n/dictionaries";
import { cn } from "@/lib/utils";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import { SignOutButton } from "@/components/sign-out-button";
import { AppMarketplace } from "@/components/apps/app-marketplace";
import { ParticleWallpaper } from "@/components/demo/particle-wallpaper";

/**
 * The org's system list, shared by `/{orgSlug}/my-apps` and the legacy `/my-apps`.
 *
 * The body used to live only in `/my-apps` and read the org from the session,
 * which meant the org could not appear in the URL: `/{org}/my-apps` could only
 * redirect back to `/my-apps`. The org is now a prop resolved from the slug by
 * the caller, so the canonical URL and the session agree by construction rather
 * than by redirect.
 *
 * This page used to list only the org's *installed* systems, so the systems a
 * customer could choose from lived on a different page (`/apps`) than the ones
 * they owned, and a new org saw a single card. It now renders the whole catalog
 * inline - the same grid the marketplace uses - so installed, installable and
 * coming-soon systems sit together and every card states its own position.
 */

/** Statuses whose org can actually be opened; mirrors the `/{org}` layout gate. */
const ACTIVE_ORG_STATUSES: ReadonlySet<string> = new Set(["active"]);

export async function MyAppsScreen({ organizationId }: { organizationId: string }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const { dict, locale, dir } = await getDictAndDir();
  const d = (key: string) => t(dict, `platform.myapps.${key}`);

  // Every org the user belongs to, for the switcher. Membership-scoped, so this
  // can never render an org the user cannot open.
  const memberships = await prisma.member.findMany({
    where: { userId: session.user.id },
    select: {
      role: true,
      organization: { select: { id: true, name: true, slug: true, logo: true, status: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // The whole catalog with per-system state for THIS org, so a single render
  // covers both "what I have" and "what I can add".
  const [marketplace, pendingRequests, org] = await Promise.all([
    getCustomerMarketplace(organizationId, session.user.id),
    prisma.organizationAppRequest.findMany({
      where: { organizationId, status: "pending" },
      include: { app: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, slug: true, logo: true },
    }),
  ]);

  const displayName = (app: { nameAr: string | null; name: string }) =>
    locale === "ar" ? (app.nameAr ?? app.name) : app.name;

  const installedCount = marketplace.filter((m) => m.state === "installed").length;

  return (
    <OnboardingShell>
      {/* Same drifting particle wallpaper as /demo; sits behind the shell's own
          ambient orbs at -z-10. */}
      <ParticleWallpaper />
      <main className="min-h-[calc(100vh-4rem)]" dir={dir}>
        <div className="mx-auto max-w-6xl px-4 py-12">
          {/* Header — the /demo hero look rather than a plain list heading. */}
          <section className="mb-8">
            <div className="mb-2 flex items-center gap-4">
              {org?.logo && (
                <img
                  src={org.logo}
                  alt=""
                  className="h-14 w-14 rounded-2xl border border-white/[0.08] object-cover ring-1 ring-primary/30"
                />
              )}
              <div>
                <h1 className="text-gradient text-3xl font-extrabold tracking-tight sm:text-4xl">
                  {org?.name}
                </h1>
                <p className="mt-1 font-mono text-sm text-white/45" dir="ltr">
                  /{org?.slug}
                </p>
              </div>
            </div>
            <p className="mt-3 max-w-2xl text-white/60">{d("subtitle")}</p>

            {/* Org switcher. Previously the only way to change org was a full page
                trip to /select-org and a POST; these links go straight to the
                target org, whose layout re-proves membership and switches the
                session. Hidden for single-org users, who have nothing to switch to. */}
            {memberships.length > 1 && (
              <nav aria-label={d("switchOrg")} className="mt-5 flex flex-wrap items-center gap-2">
                {memberships.map((m) => {
                  const isActive = m.organization.id === organizationId;
                  const blocked = !ACTIVE_ORG_STATUSES.has(m.organization.status);
                  return (
                    <Link
                      key={m.organization.id}
                      href={blocked ? "/select-org" : `/${m.organization.slug}/my-apps`}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs backdrop-blur-xl transition-all",
                        isActive
                          ? "border-primary/60 bg-primary/15 text-primary shadow-lg shadow-primary/10"
                          : "border-white/[0.12] text-white/70 hover:border-primary/40 hover:text-white",
                        blocked && "opacity-50",
                      )}
                    >
                      {m.organization.logo && (
                        <img
                          src={m.organization.logo}
                          alt=""
                          className="size-4 rounded-full object-cover"
                        />
                      )}
                      {m.organization.name}
                    </Link>
                  );
                })}
              </nav>
            )}
          </section>

          {/* Pending approval requests (legacy pre-self-service rows) */}
          {pendingRequests.length > 0 && (
            <div className="mb-8 space-y-2">
              <div className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300 backdrop-blur-xl">
                <span className="text-lg">⏳</span>
                <div>
                  {pendingRequests.map((r) => (
                    <p key={r.id}>
                      <span className="font-medium">{displayName(r.app)}</span> — {d("pendingNote")}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* The full catalog. Same component the marketplace uses, so install
              behaviour, state badges and search stay in one place; the count in
              the heading is what makes the grid's size legible ("198 systems" is
              otherwise indistinguishable from a page that failed to load). */}
          <div className="mb-6 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-white/[0.06] pb-3">
            <h2 className="text-xl font-bold text-white">
              {locale === "ar" ? "الأنظمة" : "Systems"}
            </h2>
            <p className="text-sm text-white/50">
              {locale === "ar"
                ? `${marketplace.length} نظاماً — ${installedCount} مثبت`
                : `${marketplace.length} systems — ${installedCount} installed`}
            </p>
            <span className="demo-underline is-revealed mt-1 flex-1 opacity-60" />
          </div>

          <AppMarketplace initialApps={marketplace} dict={dict} locale={locale} />

          {/* User Info */}
          <div className="mt-12 border-t border-white/[0.08] pt-6">
            <div className="flex items-center justify-between text-sm text-white/60">
              <span>{session.user.email}</span>
              <SignOutButton
                label={d("signOut")}
                className="text-red-400 transition-colors hover:text-red-300"
              />
            </div>
          </div>
        </div>
      </main>
    </OnboardingShell>
  );
}

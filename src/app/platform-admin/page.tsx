import { prisma } from "@/core/db/client";
import { getAppCatalog } from "@/core/apps/service";
import { ORG_STATUS } from "@/core/platform/approval";
import { getDictAndDir } from "@/core/i18n/server";
import { t } from "@/core/i18n/dictionaries";
import Link from "next/link";
import { Building2, BadgeCheck, Hourglass, Users, AppWindow, ArrowUpLeft, Sparkles, type LucideIcon } from "lucide-react";

export const dynamic = "force-dynamic";

const STATUS_TINT: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-400",
  suspended: "bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300",
  cancelled: "bg-slate-200 text-slate-600 dark:bg-neutral-500/15 dark:text-neutral-400",
};

const PANEL = "rounded-2xl border border-slate-200 bg-white shadow-lg dark:border-white/5 dark:bg-neutral-900/80 dark:shadow-xl";
const ROW_HOVER = "transition hover:bg-slate-50 dark:hover:bg-white/[0.03]";
const TRACK = "h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/5";
const NAME = "truncate text-sm text-slate-700 dark:text-neutral-300";
const STRONG = "shrink-0 text-right text-sm font-bold tabular-nums text-slate-900 dark:text-white";
const SUB = "text-slate-500 dark:text-neutral-500";
const H2 = "text-sm font-bold text-slate-900 dark:text-white";
const SECTION_LINK = "flex items-center gap-1 text-xs text-slate-500 transition hover:text-slate-900 dark:text-neutral-500 dark:hover:text-white";

function statusPill(status: string) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${STATUS_TINT[status] ?? "bg-slate-200 text-slate-600 dark:bg-neutral-500/15 dark:text-neutral-400"}`}>
      {status}
    </span>
  );
}

export default async function PlatformDashboardPage() {
  const { dict, locale } = await getDictAndDir();
  const d = (key: string) => t(dict, `platform.dashboard.${key}`);
  const numLocale = locale === "ar" ? "ar-EG" : "en-US";
  const fmtNum = (n: number) => n.toLocaleString(numLocale);
  const fmtDate = (x: Date) =>
    new Date(x).toLocaleString(numLocale, { dateStyle: "medium", timeStyle: "short" });
  const fmtMoney = (minor: bigint | null) => {
    if (minor === null) return "—";
    return `${(Number(minor) / 100).toLocaleString(numLocale, { maximumFractionDigits: 0 })}/mo`;
  };

  const [orgGroups, users, installs, requestGroups, catalog, pendingOrgs, appRequests] = await Promise.all([
    prisma.organization.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.user.count(),
    prisma.organizationApp.count(),
    prisma.organizationAppRequest.groupBy({ by: ["status"], _count: { _all: true } }),
    getAppCatalog(),
    prisma.organization.findMany({
      where: { status: ORG_STATUS.PENDING },
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
        members: { where: { role: "owner" }, select: { user: { select: { email: true, name: true } } }, take: 1 },
      },
      orderBy: { createdAt: "asc" },
      take: 8,
    }),
    prisma.organizationAppRequest.findMany({
      where: { status: "pending" },
      select: {
        id: true,
        createdAt: true,
        organization: { select: { name: true, slug: true } },
        app: { select: { slug: true, name: true, nameAr: true } },
        requestedBy: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 8,
    }),
  ]);

  const [planDistro, plans] = await Promise.all([
    prisma.organization.groupBy({ by: ["planId"], _count: { _all: true } }),
    prisma.plan.findMany({ select: { id: true, code: true, nameEn: true, nameAr: true, priceMonthlyMinor: true } }),
  ]);
  const planMap = new Map(plans.map((p) => [p.id, p]));
  const distro = planDistro
    .map((dt) => {
      const plan = dt.planId ? planMap.get(dt.planId) : undefined;
      return { key: dt.planId ?? "none", label: plan ? (plan.nameEn ?? plan.code ?? plan.nameAr ?? "Plan") : d("noPlan"), price: plan?.priceMonthlyMinor ?? null, count: dt._count._all };
    })
    .sort((a, b) => b.count - a.count);
  const maxPlan = Math.max(...distro.map((x) => x.count), 1);

  const [recentOrgs, activity] = await Promise.all([
    prisma.organization.findMany({
      select: { id: true, name: true, slug: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
  ]);

  const counts = new Map(orgGroups.map((g) => [g.status, g._count._all]));
  const totalTenants = orgGroups.reduce((acc, g) => acc + g._count._all, 0);
  const activeTenants = counts.get("active") ?? 0;
  const pendingCount = (counts.get("pending") ?? 0) + (requestGroups.find((r) => r.status === "pending")?._count._all ?? 0);
  const pendingReviews = pendingOrgs.length + appRequests.length;

  const topSystems = [...catalog].sort((a, b) => b.installCount - a.installCount).slice(0, 6);
  const maxInstalls = Math.max(...topSystems.map((s) => s.installCount), 1);

  const kpis: { label: string; value: number; note: string; icon: LucideIcon; chip: string; bar: string; glow: string }[] = [
    { label: d("kpiTenants"), value: totalTenants, note: `${fmtNum(activeTenants)} ${d("activeNote")}`, icon: Building2, chip: "bg-blue-500/10 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300", bar: "from-blue-500 to-cyan-400", glow: "hover:shadow-blue-500/10" },
    { label: d("kpiActive"), value: activeTenants, note: `${activeTenants && totalTenants ? Math.round((activeTenants / totalTenants) * 100) : 0}% ${d("ofTenants")}`, icon: BadgeCheck, chip: "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300", bar: "from-emerald-500 to-teal-400", glow: "hover:shadow-emerald-500/10" },
    { label: d("kpiPending"), value: pendingCount, note: `${fmtNum(pendingReviews)} ${d("waitingNote")}`, icon: Hourglass, chip: "bg-amber-500/10 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300", bar: "from-amber-500 to-orange-400", glow: "hover:shadow-amber-500/10" },
    { label: d("kpiUsers"), value: users, note: `${users ? Math.round((users / Math.max(totalTenants, 1)) * 100) : 0} ${d("perTenantAvg")}`, icon: Users, chip: "bg-violet-500/10 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300", bar: "from-violet-500 to-fuchsia-400", glow: "hover:shadow-violet-500/10" },
    { label: d("kpiInstalls"), value: installs, note: `${fmtNum(catalog.length)} ${d("inCatalog")}`, icon: AppWindow, chip: "bg-cyan-500/10 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300", bar: "from-cyan-500 to-sky-400", glow: "hover:shadow-cyan-500/10" },
  ];

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-slate-100 p-6 shadow-lg dark:border-white/5 dark:from-neutral-900 dark:via-neutral-900 dark:to-neutral-950 dark:shadow-xl">
        <div className="pointer-events-none absolute -top-24 end-0 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 start-1/3 h-56 w-56 rounded-full bg-violet-600/10 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className={`flex items-center gap-1.5 text-xs font-medium uppercase tracking-widest ${SUB}`}>
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              {d("eyebrow")}
            </p>
            <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{d("title")}</h1>
            <p className={`mt-1 text-sm ${SUB}`}>{new Date().toLocaleDateString(numLocale, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
          </div>
          <div className="flex gap-2">
            <Link href="/platform-admin/systems" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-neutral-200 dark:hover:border-white/20 dark:hover:bg-white/10 dark:hover:text-white">
              {d("manageSystems")}
            </Link>
            <Link href="/platform-admin/approvals" className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white shadow-lg shadow-primary/25 transition hover:brightness-110">
              {d("approvals")}{pendingReviews > 0 ? ` · ${fmtNum(pendingReviews)}` : ""}
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {kpis.map((k) => (
          <div key={k.label} className={`group relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-5 shadow-lg transition duration-300 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-xl dark:border-white/5 dark:from-neutral-900 dark:to-neutral-950 dark:shadow-xl dark:hover:border-white/10 dark:hover:shadow-2xl ${k.glow}`}>
            <span className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${k.bar}`} />
            <div className="flex items-center justify-between">
              <p className={`text-xs font-medium ${SUB}`}>{k.label}</p>
              <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${k.chip}`}>
                <k.icon className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900 dark:text-white">{fmtNum(k.value)}</p>
            <p className={`mt-1 text-xs ${SUB}`}>{k.note}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section className={`${PANEL} p-5`}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className={H2}>{d("plansTitle")}</h2>
              <Link href="/platform-admin/plans" className={SECTION_LINK}>{d("managePlans")} <ArrowUpLeft className="h-3.5 w-3.5 rtl:rotate-180" /></Link>
            </div>
            {distro.length === 0 ? (
              <p className={`py-6 text-center text-sm ${SUB}`}>{d("noTenants")}</p>
            ) : (
              <div className="space-y-3">
                {distro.map((x) => (
                  <div key={x.key} className={`flex items-center gap-3 rounded-xl px-2 py-1.5 ${ROW_HOVER}`}>
                    <span className={`w-40 shrink-0 ${NAME}`}>{x.label}</span>
                    <div className={TRACK}>
                      <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500 transition-all" style={{ width: `${(x.count / maxPlan) * 100}%` }} />
                    </div>
                    <span className={`w-16 ${STRONG}`}>{fmtNum(x.count)}</span>
                    <span className={`w-20 shrink-0 text-right text-xs tabular-nums ${SUB}`}>{fmtMoney(x.price)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className={`${PANEL} p-5`}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className={H2}>{d("systemsTitle")}</h2>
              <Link href="/platform-admin/systems" className={SECTION_LINK}>{d("openCatalog")} <ArrowUpLeft className="h-3.5 w-3.5 rtl:rotate-180" /></Link>
            </div>
            {topSystems.every((s) => s.installCount === 0) ? (
              <p className={`py-6 text-center text-sm ${SUB}`}>{d("noInstalls")}</p>
            ) : (
              <div className="space-y-3">
                {topSystems.map((s) => (
                  <div key={s.slug} className={`flex items-center gap-3 rounded-xl px-2 py-1.5 ${ROW_HOVER}`}>
                    <span className={`w-40 shrink-0 ${NAME}`}>{locale === "ar" ? (s.nameAr ?? s.name) : s.name}</span>
                    {s.kind === "demo" && <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-medium text-cyan-800 dark:bg-cyan-500/15 dark:text-cyan-300">{d("demoPill")}</span>}
                    <div className={TRACK}>
                      <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all" style={{ width: `${(s.installCount / maxInstalls) * 100}%` }} />
                    </div>
                    <span className={`w-12 ${STRONG}`}>{fmtNum(s.installCount)}</span>
                    {s.requestCount > 0 && (
                      <span className="w-auto shrink-0 text-right text-xs font-medium text-amber-700 dark:text-amber-300">{fmtNum(s.requestCount)} {d("pendingSuffix")}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="space-y-4">
          <section className={`${PANEL} p-5`}>
            <h2 className={`mb-4 ${H2}`}>{d("statusTitle")}</h2>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "active", value: counts.get("active") ?? 0 },
                { label: "pending", value: counts.get("pending") ?? 0 },
                { label: "rejected", value: counts.get("rejected") ?? 0 },
                { label: "suspended", value: counts.get("suspended") ?? 0 },
                { label: "cancelled", value: counts.get("cancelled") ?? 0 },
              ].map((s) => (
                <div key={s.label} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/5 dark:bg-neutral-950/60">
                  {statusPill(s.label)}
                  <span className={`text-sm font-bold tabular-nums text-slate-900 dark:text-white`}>{fmtNum(s.value)}</span>
                </div>
              ))}
            </div>
          </section>

          <section className={`${PANEL} p-5`}>
            <h2 className={`mb-4 ${H2}`}>{d("activityTitle")}</h2>
            {activity.length === 0 ? (
              <p className={`py-6 text-center text-sm ${SUB}`}>{d("noActivity")}</p>
            ) : (
              <ul className="space-y-3">
                {activity.map((a) => (
                  <li key={a.id} className="flex items-start gap-3 text-sm">
                    <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_TINT[a.action.includes("reject") ? "rejected" : "pending"] ?? "bg-slate-300 dark:bg-neutral-600"}`} />
                    <div className="min-w-0">
                      <p className={`truncate text-slate-700 dark:text-neutral-300`}>{(a.action ?? "action").split(".").pop()?.replace(/_/g, " ")}</p>
                      <p className={`text-xs ${SUB}`}>{a.entityType ?? "system"} · {fmtDate(a.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={`${PANEL} p-5`}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className={H2}>{d("reviewTitle")} · {fmtNum(pendingReviews)}</h2>
            <Link href="/platform-admin/approvals" className={SECTION_LINK}>{d("reviewQueue")} <ArrowUpLeft className="h-3.5 w-3.5 rtl:rotate-180" /></Link>
          </div>
          {pendingReviews === 0 ? (
            <p className={`py-6 text-center text-sm ${SUB}`}>{d("queueClear")}</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-white/5">
              {pendingOrgs.map((org) => {
                const owner = org.members[0]?.user;
                return (
                  <li key={org.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800 dark:text-neutral-200">{org.name}</p>
                      <p className={`truncate text-xs ${SUB}`}>{owner?.email ?? org.slug} · {fmtDate(org.createdAt)}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">{d("tenantPill")}</span>
                  </li>
                );
              })}
              {appRequests.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800 dark:text-neutral-200">{r.organization.name} · {locale === "ar" ? (r.app.nameAr ?? r.app.name) : r.app.name}</p>
                    <p className={`truncate text-xs ${SUB}`}>{r.requestedBy?.email ?? r.app.slug} · {fmtDate(r.createdAt)}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-violet-100 px-2.5 py-0.5 text-[11px] font-medium text-violet-800 dark:bg-violet-500/15 dark:text-violet-300">{d("systemPill")}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={`${PANEL} p-5`}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className={H2}>{d("recentTitle")}</h2>
            <Link href="/platform-admin/tenants" className={SECTION_LINK}>{d("allTenants")} <ArrowUpLeft className="h-3.5 w-3.5 rtl:rotate-180" /></Link>
          </div>
          {recentOrgs.length === 0 ? (
            <p className={`py-6 text-center text-sm ${SUB}`}>{d("recentEmpty")}</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-white/5">
              {recentOrgs.map((org) => (
                <li key={org.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800 dark:text-neutral-200">{org.name}</p>
                    <p className={`truncate text-xs ${SUB}`}>{org.slug} · {fmtDate(org.createdAt)}</p>
                  </div>
                  {statusPill(org.status)}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

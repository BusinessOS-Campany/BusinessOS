import { notFound } from "next/navigation";
import Link from "next/link";
import { getDictAndDir, t } from "@/core/i18n/server";
import { prisma } from "@/core/db/client";
import { ORG_STATUS } from "@/core/platform/approval";
import { getPlatformBaseHost } from "@/core/tenancy/host";
import { readOrgSqlInfo } from "@/core/org-vault/sql-file";
import type { TenantSqlState } from "./tenant-sql-manager";
import { displayIdentifier, isInternalAuthEmail } from "@/core/auth/identifier";
import { TenantsDetailManager } from "./tenant-manager";
import { TenantSqlManager } from "./tenant-sql-manager";
interface PageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

const APP_ICONS: Record<string, string> = {
  grocery: "🛒",
  "sama-center": "🏥",
  restaurant: "🍽️",
  retail: "🏪",
  pharmacy: "💊",
  school: "🎓",
};

function statusStyle(status: string): string {
  switch (status) {
    case "active":
      return "bg-primary/10 text-primary";
    case "pending":
      return "bg-amber-500/15 text-amber-300";
    case "rejected":
      return "bg-red-900/60 text-red-300";
    default:
      return "bg-red-900/60 text-red-300";
  }
}

export default async function TenantDetailPage({ params }: PageProps) {
  const { id } = await params;
  const { dict, dir } = await getDictAndDir();

  const org = await prisma.organization.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      templateCode: true,
      schemaName: true,
      databaseName: true,
      createdAt: true,
      settings: true,
      plan: { select: { code: true, nameEn: true, nameAr: true } },
      members: {
        include: {
          user: { select: { id: true, email: true, phone: true, countryCode: true, name: true, role: true } },
        },
        orderBy: { role: "asc" },
      },
      orgApps: { include: { app: { select: { slug: true, name: true, nameAr: true } } } },
    },
  });
  if (!org) notFound();

  const [availableApps, plans, pendingCount] = await Promise.all([
    prisma.app.findMany({
      where: { isActive: true },
      select: { slug: true, name: true, nameAr: true },
      orderBy: { name: "asc" },
    }),
    prisma.plan.findMany({
      where: { isActive: true },
      select: { code: true, nameEn: true, nameAr: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.organization.count({ where: { status: ORG_STATUS.PENDING } }),
  ]);

  const owners = org.members.filter((m) => m.role === "owner");
  const owner = owners[0]?.user;

  // An account can be created with a phone number instead of an email, and a
  // phone registration carries an internal stand-in address. Neither should be
  // shown or mailed, so the admin console always renders `displayIdentifier`
  // and only offers `mailto:` when a real address exists.
  const ownerIdentifier = owner ? displayIdentifier(owner) : null;
  const ownerMailto = owner?.email && !isInternalAuthEmail(owner.email) ? owner.email : null;

  const orgSettings = (org.settings ?? {}) as { domains?: unknown };
  const domains = Array.isArray(orgSettings.domains) ? (orgSettings.domains as string[]) : [];
  const baseDomain = getPlatformBaseHost();

  // The file panel needs live schema state (is `t_<slug>` there, how many rows).
  // A database problem must not take the whole admin page down with it, so an
  // unreadable state degrades to "no file yet" and the panel can still act.
  const sqlFallback: TenantSqlState = {
    file: "",
    exists: false,
    bytes: 0,
    sha256: null,
    exportedAt: null,
    schema: org.schemaName ?? `t_${org.slug}`,
    schemaPresent: false,
    rowsTotal: 0,
    tablesWithRows: [],
  };
  const sql: TenantSqlState = await readOrgSqlInfo(org.slug)
    .then((info) => ({
      file: info.fileName,
      exists: info.exists,
      bytes: info.bytes,
      sha256: info.sha256,
      exportedAt: info.exportedAt,
      schema: info.schemaName,
      schemaPresent: info.schemaPresent,
      rowsTotal: info.rowsTotal,
      tablesWithRows: info.tablesWithRows,
    }))
    .catch(() => sqlFallback);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/platform-admin/tenants" className="flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white">
            <span aria-hidden>{dir === "rtl" ? "→" : "←"}</span>
            {t(dict, "platform.tenantDetail.back")}
          </Link>
          <h1 className="text-lg font-semibold">{t(dict, "platform.tenantDetail.title")}</h1>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs ${statusStyle(org.status)}`}>
          {org.status}
        </span>
      </div>

      {/* Info card */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold">{org.name}</h2>
              <span className="font-mono text-xs text-neutral-500">@{org.slug}</span>
            </div>
            <p className="mt-1 text-sm text-neutral-400">
              {t(dict, "platform.overview.owner")}: <span className="text-neutral-200">{owner?.name ?? "—"}</span>{" "}
              {ownerMailto ? (
                <a href={`mailto:${ownerMailto}`} className="text-primary hover:underline">
                  {ownerIdentifier}
                </a>
              ) : (
                <span className="text-primary">{ownerIdentifier ?? "—"}</span>
              )}
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-neutral-500">{t(dict, "platform.overview.plan")}</dt>
              <dd className="text-neutral-200">{org.plan?.nameEn ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">{t(dict, "platform.tenantDetail.template.label")}</dt>
              <dd className="text-neutral-200">{org.templateCode ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">{t(dict, "platform.tenantDetail.ownerCount")}</dt>
              <dd className="text-neutral-200">{owners.length}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">{t(dict, "platform.tenantDetail.created")}</dt>
              <dd className="text-neutral-200">{org.createdAt.toLocaleDateString("en-CA")}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500">{t(dict, "platform.tenantDetail.database")}</dt>
              <dd className="font-mono text-xs text-neutral-200">{org.schemaName ?? "—"}</dd>
            </div>
          </dl>
        </div>
      </div>

      <TenantSqlManager tenantId={org.id} initial={sql} />

      <TenantsDetailManager
        tenantId={org.id}
        dict={dict}
        initial={{
          status: org.status,
          planCode: org.plan?.code ?? "trial",
          grantedApps: org.orgApps.map((oa) => ({
            appId: oa.appId,
            slug: oa.app.slug,
            name: oa.app.nameAr ?? oa.app.name,
            status: oa.status,
            icon: APP_ICONS[oa.app.slug] ?? "📦",
          })),
          availableApps: availableApps.map((a) => ({
            slug: a.slug,
            name: a.nameAr ?? a.name,
          })),
          plans: plans.map((p) => ({ code: p.code, label: p.nameAr ?? p.nameEn })),
          members: org.members.map((m) => ({
            memberId: m.id,
            userId: m.user.id,
            name: m.user.name,
            // Phone-only members have no real address; the table column is
            // labelled as an identifier so a number reads correctly there.
            email: displayIdentifier(m.user) || "—",
            role: m.role,
            isPlatformAdmin: m.user.role === "admin",
          })),
          domains,
          subdomain: `${org.slug}.${baseDomain}`,
          baseDomain,
          pendingCount,
        }}
      />
    </div>
  );
}
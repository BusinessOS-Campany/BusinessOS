import { getDictAndDir, t } from "@/core/i18n/server";
import { prisma } from "@/core/db/client";
import { ORG_STATUS, suggestedAppForTemplate } from "@/core/platform/approval";
import { TENANT_ROLE_NAMES } from "@/core/permissions/catalog";
import { ApprovalPanel } from "./approval-panel";
import { AppRequestPanel } from "./app-request-panel";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const { dict, locale } = await getDictAndDir();
  const [pending, rejectedOrganizations, apps, plans, appRequests, rejectedRequests] = await Promise.all([
    prisma.organization.findMany({
      where: { status: ORG_STATUS.PENDING },
      select: {
        id: true,
        name: true,
        slug: true,
        templateCode: true,
        createdAt: true,
        members: {
          where: { role: "owner" },
          select: { user: { select: { email: true, name: true } } },
          take: 1,
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.organization.findMany({
      where: { status: ORG_STATUS.REJECTED },
      select: {
        id: true,
        name: true,
        slug: true,
        templateCode: true,
        createdAt: true,
        members: {
          where: { role: "owner" },
          select: { user: { select: { email: true, name: true } } },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.app.findMany({
      where: { status: "active" },
      select: { slug: true, name: true, nameAr: true },
      orderBy: { name: "asc" },
    }),
    prisma.plan.findMany({
      where: { isActive: true },
      select: { code: true, nameEn: true, nameAr: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.organizationAppRequest.findMany({
      where: { status: "pending" },
      select: {
        id: true,
        status: true,
        rejectReason: true,
        decidedAt: true,
        createdAt: true,
        note: true,
        organization: { select: { name: true, slug: true } },
        app: { select: { slug: true, name: true, nameAr: true } },
        requestedBy: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.organizationAppRequest.findMany({
      where: { status: "rejected" },
      select: {
        id: true,
        status: true,
        rejectReason: true,
        decidedAt: true,
        createdAt: true,
        note: true,
        organization: { select: { name: true, slug: true } },
        app: { select: { slug: true, name: true, nameAr: true } },
        requestedBy: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{t(dict, "platform.approvals.title")}</h1>
        <span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs text-amber-300">
          {pending.length} {t(dict, "platform.approvals.pending")}
        </span>
      </div>

      {pending.length === 0 ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-8 text-center text-sm text-neutral-400">
          {t(dict, "platform.approvals.empty")}
        </div>
      ) : (
        <div className="space-y-4">
          {pending.map((org) => {
            const owner = org.members[0]?.user;
            return (
              <ApprovalPanel
                key={org.id}
                dict={dict}
                locale={locale}
                org={{
                  id: org.id,
                  name: org.name,
                  slug: org.slug,
                  templateCode: org.templateCode,
                  createdAt: org.createdAt.toISOString(),
                  ownerEmail: owner?.email ?? "—",
                  ownerName: owner?.name ?? "—",
                  status: "pending",
                }}
                suggestedApp={suggestedAppForTemplate(org.templateCode)}
                apps={apps.map((a) => ({ slug: a.slug, label: a.nameAr ?? a.name }))}
                plans={plans.map((p) => ({ code: p.code, label: p.nameAr ?? p.nameEn }))}
                roles={TENANT_ROLE_NAMES}
              />
            );
          })}
        </div>
      )}

      <div className="border-t border-neutral-800 pt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t(dict, "platform.approvals.rejectedTitle")}</h2>
          <span className="rounded-full bg-red-500/15 px-3 py-1 text-xs text-red-400">
            {rejectedOrganizations.length} {t(dict, "platform.approvals.rejected")}
          </span>
        </div>

        {rejectedOrganizations.length === 0 ? (
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-8 text-center text-sm text-neutral-400">
            {t(dict, "platform.approvals.rejectedEmpty")}
          </div>
        ) : (
          <div className="space-y-4">
            {rejectedOrganizations.map((org) => {
              const owner = org.members[0]?.user;
              return (
                <ApprovalPanel
                  key={org.id}
                  dict={dict}
                  locale={locale}
                  org={{
                    id: org.id,
                    name: org.name,
                    slug: org.slug,
                    templateCode: org.templateCode,
                    createdAt: org.createdAt.toISOString(),
                    ownerEmail: owner?.email ?? "—",
                    ownerName: owner?.name ?? "—",
                    status: "rejected",
                  }}
                  suggestedApp={suggestedAppForTemplate(org.templateCode)}
                  apps={apps.map((a) => ({ slug: a.slug, label: a.nameAr ?? a.name }))}
                  plans={plans.map((p) => ({ code: p.code, label: p.nameAr ?? p.nameEn }))}
                  roles={TENANT_ROLE_NAMES}
                />
              );
            })}
          </div>
        )}

        <p className="mt-4 text-xs text-neutral-500">
          {t(dict, "platform.approvals.rejectedNote")}
        </p>
      </div>

      <div className="border-t border-neutral-800 pt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t(dict, "platform.appRequests.title")}</h2>
          <span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs text-amber-300">
            {appRequests.length} {t(dict, "platform.appRequests.pending")}
          </span>
        </div>

        {appRequests.length === 0 ? (
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-8 text-center text-sm text-neutral-400">
            {t(dict, "platform.appRequests.empty")}
          </div>
        ) : (
          <div className="space-y-4">
            {appRequests.map((req) => (
              <AppRequestPanel
                key={req.id}
                dict={dict}
                locale={locale}
                req={{
                  id: req.id,
                  orgName: req.organization.name,
                  orgSlug: req.organization.slug,
                  appName: req.app.name,
                  appNameAr: req.app.nameAr,
                  appSlug: req.app.slug,
                  requestedByName: req.requestedBy?.name ?? "—",
                  requestedByEmail: req.requestedBy?.email ?? "—",
                  createdAt: req.createdAt.toISOString(),
                  status: "pending",
                  rejectReason: null,
                  note: req.note,
                }}
              />
            ))}
          </div>
        )}

        <p className="mt-4 text-xs text-neutral-500">
          {t(dict, "platform.appRequests.waitNote")}
        </p>
      </div>

      <div className="border-t border-neutral-800 pt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t(dict, "platform.appRequests.rejectedTitle")}</h2>
          <span className="rounded-full bg-red-500/15 px-3 py-1 text-xs text-red-400">
            {rejectedRequests.length} {t(dict, "platform.appRequests.rejected")}
          </span>
        </div>

        {rejectedRequests.length === 0 ? (
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-8 text-center text-sm text-neutral-400">
            {t(dict, "platform.appRequests.rejectedEmpty")}
          </div>
        ) : (
          <div className="space-y-4">
            {rejectedRequests.map((req) => (
              <AppRequestPanel
                key={req.id}
                dict={dict}
                locale={locale}
                req={{
                  id: req.id,
                  orgName: req.organization.name,
                  orgSlug: req.organization.slug,
                  appName: req.app.name,
                  appNameAr: req.app.nameAr,
                  appSlug: req.app.slug,
                  requestedByName: req.requestedBy?.name ?? "—",
                  requestedByEmail: req.requestedBy?.email ?? "—",
                  createdAt: req.createdAt.toISOString(),
                  status: "rejected",
                  rejectReason: req.rejectReason,
                  note: req.note,
                }}
              />
            ))}
          </div>
        )}

        <p className="mt-4 text-xs text-neutral-500">
          {t(dict, "platform.appRequests.rejectedNote")}
        </p>
      </div>
    </div>
  );
}
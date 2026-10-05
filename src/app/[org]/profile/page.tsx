import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/core/auth/server";
import { prisma } from "@/core/db/client";
import { resolveOrgScope } from "@/core/tenancy/org-route";
import { getDictAndDir } from "@/core/i18n/server";
import { parseProfileTab, type ProfileTab } from "@/core/profile/service";
import type { ProfileOrgContext } from "@/core/profile/types";
import { t } from "@/core/i18n/dictionaries";
import { ProfileScreen } from "@/components/profile/profile-screen";

/** The org layout already gated this; force-dynamic keeps the cookies honest. */
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { dict } = await getDictAndDir();
  return { title: `${t(dict, "profile.editor.title")} — Business OS` };
}

/**
 * `/{orgSlug}/profile` — the user's own profile, scoped to the org in the URL.
 *
 * The page content is the private profile, not an org directory: the org decides
 * the tenant context, the session decides whose profile it is. The `/{org}/layout`
 * guard has already proven membership and made this org the active one.
 *
 * In addition to the user-centric overview, the org scope lets the systems tab
 * offer an "add a system" button (which opens this org's marketplace chooser at
 * `/{org}/my-apps`) and list the platform-approval requests this org is waiting
 * on. Requests are raised on the marketplace page; they land in the same queue
 * the platform admin reviews.
 */
export default async function OrgProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tabParam = typeof sp.tab === "string" ? sp.tab : null;
  const tab: ProfileTab = parseProfileTab(tabParam);

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) notFound();

  const { org: slug } = await params;
  const scope = await resolveOrgScope(slug, session.user.id);
  if (scope.kind !== "ok") notFound();

  const pending = await prisma.organizationAppRequest.findMany({
    where: { organizationId: scope.organization.id, status: "pending" },
    include: { app: { select: { id: true, slug: true, name: true, nameAr: true } } },
    orderBy: { createdAt: "asc" },
  });

  const orgContext: ProfileOrgContext = {
    organizationId: scope.organization.id,
    organizationName: scope.organization.name,
    organizationSlug: scope.organization.slug,
    pending: pending.map((r) => ({
      id: r.id,
      slug: r.app.slug,
      name: r.app.name,
      nameAr: r.app.nameAr,
      requestedAt: r.createdAt.toISOString(),
    })),
  };

  return <ProfileScreen tab={tab} orgContext={orgContext} />;
}
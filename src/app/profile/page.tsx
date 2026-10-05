import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/core/auth/server";
import { prisma } from "@/core/db/client";
import { getDictAndDir } from "@/core/i18n/server";
import { parseProfileTab, type ProfileTab } from "@/core/profile/service";
import { t } from "@/core/i18n/dictionaries";
import { orgProfilePath } from "@/core/tenancy/org-route";
import { ProfileScreen } from "@/components/profile/profile-screen";

/** Session- and cookie-dependent: never statically prerendered. */
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { dict } = await getDictAndDir();
  return { title: `${t(dict, "profile.editor.title")} — Business OS` };
}

/**
 * `/profile` — legacy non-org-scoped alias for `/{orgSlug}/profile`.
 *
 * This used to render the profile directly, resolving the org from the session.
 * It now forwards to the org URL instead, for two reasons:
 *
 *  1. The org belongs in the address bar. A profile showing "your organizations"
 *     and their roles while the URL says nothing about which org is open is
 *     exactly the ambiguity the org-in-the-URL change exists to remove, and the
 *     landing rail links here.
 *  2. One implementation, not two. Rendering here would mean a second entry
 *     point that can drift from `/{org}/profile`.
 *
 * The tab is carried across so a deep link like `/profile?tab=organizations`
 * still lands on the right tab. When no org can be determined - no session, no
 * memberships, or several to choose between - the screen renders directly,
 * because `ProfileScreen` already owns the signed-out and no-org cases.
 */
export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tabParam = typeof sp.tab === "string" ? sp.tab : null;
  const tab: ProfileTab = parseProfileTab(tabParam);

  const session = await auth.api.getSession({ headers: await headers() });
  const slug = session ? await resolveOrgSlugFor(session) : null;
  if (slug) {
    const qs = tabParam ? `?tab=${encodeURIComponent(tabParam)}` : "";
    redirect(`${orgProfilePath(slug)}${qs}`);
  }

  return <ProfileScreen tab={tab} />;
}

/**
 * Which org the canonical URL should be.
 *
 * The session's `activeOrganizationId` is the obvious answer but it is empty
 * until an org is chosen, so on a fresh sign-in it would send the user straight
 * back to `/profile` and defeat the redirect. Falling back to the sole
 * membership mirrors `postSignInPath`: a user who belongs to exactly one org has
 * no ambiguity about which org the URL should name.
 *
 * Null means "do not redirect" - no session, no org, or several orgs to choose
 * between, in which case `ProfileScreen` keeps owning the decision.
 */
async function resolveOrgSlugFor(
  session: { user: { id: string }; session: { activeOrganizationId?: string | null } },
): Promise<string | null> {
  const activeOrgId = session.session.activeOrganizationId;
  if (activeOrgId) {
    const org = await prisma.organization.findUnique({
      where: { id: activeOrgId },
      select: { slug: true, status: true },
    });
    if (org?.status === "active") return org.slug;
  }

  const memberships = await prisma.member.findMany({
    where: { userId: session.user.id, organization: { status: "active" } },
    select: { organization: { select: { slug: true } } },
    take: 2,
  });
  return memberships.length === 1 ? memberships[0].organization.slug : null;
}

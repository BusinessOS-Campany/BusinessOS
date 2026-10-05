import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/core/auth/server";
import { resolveOrgScope } from "@/core/tenancy/org-route";
import { MyAppsScreen } from "@/components/my-apps/my-apps-screen";

export const dynamic = "force-dynamic";

/**
 * The org's system list, addressed by org slug: `/{orgSlug}/my-apps`.
 *
 * The org comes from the URL and is re-authorized here rather than read from the
 * session, so the page cannot be made to render a different org than the one in
 * the address bar. The parent layout performs the same check (and aligns the
 * session); repeating it is cheap and keeps this page correct on its own.
 *
 * Non-members and unknown slugs both get a 404, never a 403 - see the note on
 * `resolveOrgScope` about not turning the URL into an org-enumeration oracle.
 */
export default async function OrgMyAppsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) notFound();

  const scope = await resolveOrgScope(slug, session.user.id);
  if (scope.kind !== "ok") notFound();

  return <MyAppsScreen organizationId={scope.organization.id} />;
}

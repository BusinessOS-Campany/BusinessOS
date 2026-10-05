import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/core/auth/server";
import { MyAppsScreen } from "@/components/my-apps/my-apps-screen";

export const dynamic = "force-dynamic";

/**
 * Legacy non-org-scoped alias for `/{orgSlug}/my-apps`.
 *
 * Kept so existing links and bookmarks keep working, but it is not the
 * canonical URL: the org is taken from the session here, whereas the `/{org}`
 * route takes it from the URL. Anyone landing here is forwarded to the org path
 * so the address bar reflects which org they are actually in.
 */
export default async function MyAppsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/signin");

  const activeOrgId = session.session.activeOrganizationId;
  if (!activeOrgId) redirect("/select-org");

  return <MyAppsScreen organizationId={activeOrgId} />;
}

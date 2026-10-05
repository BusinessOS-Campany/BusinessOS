import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/core/auth/server";
import { isValidOrgSlug, resolveOrgScope } from "@/core/tenancy/org-route";
import { onOrganizationOpened } from "@/core/org-vault/on-create";
import { OrgSqlAutosave } from "@/components/org/sql-autosave";

/** Session- and cookie-dependent: never statically prerendered. */
export const dynamic = "force-dynamic";

/** How often the open org re-dumps its schema to its folder. */
function autosaveSeconds(): number | undefined {
  const raw = Number(process.env.ORG_SQL_AUTOSAVE_SECONDS);
  return Number.isFinite(raw) && raw >= 60 ? raw : undefined;
}

/**
 * Guard for the whole `/{orgSlug}/...` tree.
 *
 * The org is taken from the URL and made authoritative: after this resolves, the
 * session's `activeOrganizationId` points at the org in the address bar, so every
 * existing tenant-scoped page, API route, and `requireTenantPage` call keeps
 * working unchanged. That is why the URL can be trusted without re-plumbing
 * tenancy through the app.
 */
export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ org: string }>;
}) {
  const { org: slug } = await params;
  const requestHeaders = await headers();

  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) {
    // Bounce to sign-in and come straight back to this org afterwards.
    redirect(`/signin?next=${encodeURIComponent(`/${slug}`)}`);
  }

  // An org whose slug is reserved can never own a URL, so treat it as absent
  // rather than rendering a page under a path that is really an app route.
  if (!isValidOrgSlug(slug)) notFound();

  const scope = await resolveOrgScope(slug, session.user.id);

  // "No such org" and "not your org" are deliberately the same response, so
  // this route cannot be used to discover which org slugs exist.
  if (scope.kind === "not-found") notFound();

  // A member of a pending/suspended org is told why, rather than shown a blank
  // page or bounced to the picker with no explanation.
  if (scope.kind === "inactive") {
    redirect(`/select-org?status=${encodeURIComponent(scope.status)}`);
  }

  if (session.session.activeOrganizationId !== scope.organization.id) {
    // Safe to do without a re-check: `resolveOrgScope` already proved this user
    // holds a member row for this exact org. Better Auth re-validates membership
    // server-side, and a rejection here would surface as a thrown error rather
    // than a silent cross-tenant switch.
    await auth.api.setActiveOrganization({
      headers: requestHeaders,
      body: { organizationId: scope.organization.id },
    });
  }

  // The customer is inside their org: make sure its schema exists, loading
  // `database/<folder>.sql` when the schema is not there yet. Memoized per
  // process, so this is a no-op after the first page load.
  await onOrganizationOpened({ slug });

  return (
    <>
      <OrgSqlAutosave intervalSeconds={autosaveSeconds()} />
      {children}
    </>
  );
}

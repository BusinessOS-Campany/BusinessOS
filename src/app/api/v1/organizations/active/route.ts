import { ok, withRoute, ApiError } from "@/core/http/api";
import { auth } from "@/core/auth/server";
import { resolveTenantContext, resolveTenantSpec } from "@/core/tenancy/context";
import { onOrganizationOpened } from "@/core/org-vault/on-create";

export const POST = withRoute("v1.organizations.active", async (request) => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.session) throw ApiError.unauthorized();

  const body = (await request.json().catch(() => null)) as
    | { organizationId?: string; organizationSlug?: string }
    | null;
  if (!body?.organizationId && !body?.organizationSlug) {
    throw ApiError.badRequest("organizationId or organizationSlug is required");
  }

  await auth.api.setActiveOrganization({
    body,
    headers: request.headers,
  });

  const ctx = await resolveTenantContext(request);
  // Switching org opens it: the schema is created, or loaded from the folder's
  // .sql file when it is missing. Re-resolved here because the spec was captured
  // before the switch, and it is a memoized no-op when the host path already
  // opened the org.
  const spec = await resolveTenantSpec(request);
  if (spec) await onOrganizationOpened({ slug: spec.slug });
  return ok({ tenant: ctx?.tenant ?? null });
});

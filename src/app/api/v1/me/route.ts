import { ApiError, ok, withRoute } from "@/core/http/api";
import { auth } from "@/core/auth/server";
import { resolveTenantContext } from "@/core/tenancy/context";

export const GET = withRoute("v1.me", async (request) => {
  const result = await auth.api.getSession({ headers: request.headers });
  if (!result?.session) {
    throw ApiError.unauthorized();
  }
  const tenant = await resolveTenantContext(request);
  return ok({
    user: {
      id: result.user.id,
      name: result.user.name,
      email: result.user.email,
      emailVerified: result.user.emailVerified,
      image: result.user.image ?? null,
    },
    session: {
      id: result.session.id,
      expiresAt: result.session.expiresAt.toISOString(),
    },
    organizations: (await auth.api.listOrganizations({ headers: request.headers })).map((o) => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      logo: o.logo ?? null,
    })),
    activeTenant: tenant?.tenant ?? null,
  });
});

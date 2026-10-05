import { ok, withRoute, ApiError } from "@/core/http/api";
import { auth } from "@/core/auth/server";

export const POST = withRoute("v1.organizations.create", async (request) => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.session) throw ApiError.unauthorized();

  const body = (await request.json().catch(() => null)) as { name?: string; slug?: string } | null;
  const name = body?.name?.trim();
  const slug = body?.slug?.trim().toLowerCase();
  if (!name || !/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug ?? "")) {
    throw ApiError.badRequest("name and a valid slug (2–40 chars, a-z 0-9 -) are required");
  }

  try {
    const org = await auth.api.createOrganization({
      body: { name, slug: slug as string },
      headers: request.headers,
    });
    return ok({ organization: org }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && /already exists/i.test(err.message)) {
      throw ApiError.conflict("An organization with this slug already exists");
    }
    throw err;
  }
});

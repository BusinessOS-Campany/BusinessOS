import { ApiError, ok, withRoute } from "@/core/http/api";
import { prisma } from "@/core/db/client";
import { auth } from "@/core/auth/server";

/**
 * PATCH /api/v1/profile/pin — toggle a system (app) pinned to the user's profile.
 * Body: { appId: string }. Pin = GitHub-style "pinned systems" card on the profile;
 * membership list is private but the card is visible when the tenant profile gateway is open.
 */
export const PATCH = withRoute("v1.profile.pin", async (request) => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.session) throw ApiError.unauthorized();
  const body = await request
    .json()
    .catch(() => null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .then((b: any) => ({ appId: b?.appId ?? "" }));
  if (!body.appId) throw ApiError.badRequest("appId is required");

  const existing = await prisma.pinnedApp.findUnique({
    where: { userId_appId: { userId: session.user.id, appId: body.appId } },
    select: { id: true },
  });

  if (existing) {
    await prisma.pinnedApp.delete({ where: { id: existing.id } });
    return ok({ pinned: false });
  }

  const maxSort = await prisma.pinnedApp.aggregate({
    where: { userId: session.user.id },
    _max: { sortOrder: true },
  });
  await prisma.pinnedApp.create({
    data: {
      userId: session.user.id,
      appId: body.appId,
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
    },
  });
  return ok({ pinned: true });
});

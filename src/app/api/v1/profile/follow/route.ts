import { ApiError, ok, withRoute } from "@/core/http/api";
import { prisma } from "@/core/db/client";
import { auth } from "@/core/auth/server";
import { z } from "zod";

/**
 * PATCH /api/v1/profile/follow — follow another user (GitHub-style).
 * Body: { targetUserId: string }. Idempotent; tenant-safe (platform-wide, not org-scoped).
 */
export const PATCH = withRoute("v1.profile.follow.patch", async (request) => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.session) throw ApiError.unauthorized();
  const body = z
    .object({ targetUserId: z.string().min(1) })
    .parse(await request.json().catch(() => null));
  if (body.targetUserId === session.user.id) throw ApiError.badRequest("Cannot follow yourself");

  await prisma.userFollow.upsert({
    where: {
      followerId_followingId: {
        followerId: session.user.id,
        followingId: body.targetUserId,
      },
    },
    create: { followerId: session.user.id, followingId: body.targetUserId },
    update: {},
  });
  return ok({ following: true });
});

/** DELETE /api/v1/profile/follow — unfollow targetUserId. Body: { targetUserId: string }. */
export const DELETE = withRoute("v1.profile.follow.delete", async (request) => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.session) throw ApiError.unauthorized();
  const body = z
    .object({ targetUserId: z.string().min(1) })
    .parse(await request.json().catch(() => null));

  await prisma.userFollow.deleteMany({
    where: { followerId: session.user.id, followingId: body.targetUserId },
  });
  return ok({ following: false });
});

import { z } from "zod";
import { ApiError, checkSessionRateLimit, ok, withRoute } from "@/core/http/api";
import { sharedPrisma } from "@/core/db/client";
import { requireProfileSession } from "@/core/profile/service";
import { normalizeUsername } from "@/core/profile/normalize";

/**
 * GET /api/v1/profile/username?value=foo — live availability for the editor.
 *
 * This is a GET rather than a HEAD on purpose: HTTP strips the body from a HEAD
 * response, so a client can never read the verdict out of one. The check is
 * advisory only — the authoritative test is the unique index, re-checked inside
 * `updateProfile` inside the PATCH transaction.
 */

const querySchema = z.object({ value: z.string().max(40) });

export const GET = withRoute("v1.profile.username.check", async (request) => {
  const profile = await requireProfileSession(request.headers);

  // Same cheap in-memory guard as the other mutating profile routes: without it
  // this would be a free username-enumeration oracle.
  const limit = checkSessionRateLimit(`profile:username:${profile.userId}`, 30, 60_000);
  if (!limit.allowed) {
    throw new ApiError(429, "RATE_LIMITED", "محاولات كثيرة، حاول لاحقًا", "Too many lookups, slow down");
  }

  const { value } = querySchema.parse({
    value: new URL(request.url).searchParams.get("value") ?? "",
  });

  const result = normalizeUsername(value);
  if (!result.ok) {
    // A malformed value is a formatting problem for the client to show, not a
    // rejection — hence a 200 with a reason instead of a 400.
    return ok({ available: false, reason: result.reason, username: null });
  }

  const taken = await sharedPrisma.user.findFirst({
    where: { username: result.value, NOT: { id: profile.userId } },
    select: { id: true },
  });

  return ok({ available: !taken, reason: taken ? "taken" : null, username: result.value });
});

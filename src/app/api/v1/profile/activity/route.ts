import { ApiError, checkSessionRateLimit, ok, withRoute } from "@/core/http/api";
import { getProfileActivity, requireProfileSession } from "@/core/profile/service";

/**
 * GET /api/v1/profile/activity?page=2 — paginated audit timeline plus the
 * 52-week heatmap aggregate. Separate from the profile GET so the timeline can
 * page without re-sending identity, organizations and systems, and so the first
 * paint is not blocked on it.
 */
export const GET = withRoute("v1.profile.activity", async (request) => {
  const profile = await requireProfileSession(request.headers);

  const limit = checkSessionRateLimit(`profile:activity:${profile.userId}`, 120, 60_000);
  if (!limit.allowed) {
    throw new ApiError(429, "RATE_LIMITED", "محاولات كثيرة، حاول لاحقًا", "Too many requests");
  }

  const raw = new URL(request.url).searchParams.get("page");
  const page = raw === null ? 1 : Number.parseInt(raw, 10);
  if (raw !== null && (!Number.isFinite(page) || page < 1)) {
    throw ApiError.badRequest("page must be a positive integer");
  }

  return ok(await getProfileActivity(profile.userId, Number.isFinite(page) ? page : 1));
});

import { ApiError, enforceRateLimit, ok, withRoute } from "@/core/http/api";
import { requirePlatformAdmin } from "@/core/platform/gate";
import { githubConfig } from "@/core/github/auth";
import { importSystem, importSystemSchema } from "@/core/github/service";

/**
 * POST /api/platform/github/import — import a repository as a system.
 *
 * Platform admin only. The work (clone + detect + register) runs here, but the
 * clone is bounded by a timeout inside `ensureCheckout`, so a slow repository
 * fails the request rather than hanging it.
 */
export const POST = withRoute("platform.github.import", async (request) => {
  enforceRateLimit(request, "platform:github:import", 20, 60_000);
  const admin = await requirePlatformAdmin(request);
  if (!githubConfig()) {
    throw ApiError.badRequest("GitHub App is not configured. Set GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_APP_WEBHOOK_SECRET and GITHUB_APP_SLUG.");
  }
  const body = await request.json().catch(() => {
    throw ApiError.badRequest("Invalid JSON body");
  });
  const parsed = importSystemSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid import payload", {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  const result = await importSystem(parsed.data, admin.id);
  return ok({ system: result }, { status: 201 });
});

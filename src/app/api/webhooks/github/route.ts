import { ApiError, enforceRateLimit, ok, withRoute } from "@/core/http/api";
import { verifyWebhookSignature } from "@/core/github/auth";
import { handleGithubWebhook } from "@/core/deploy/webhook";

/**
 * POST /api/webhooks/github — GitHub App webhook receiver.
 *
 * Public by necessity (GitHub calls it), authenticated by the HMAC signature
 * GitHub signs the raw body with, using the App's webhook secret. The raw body
 * is read as text exactly once: re-serializing the parsed JSON would change the
 * bytes and the signature would never match.
 *
 * The handler only verifies and enqueues — a deployment is minutes of work and
 * belongs to the platform's own worker, not to GitHub's 10-second timeout.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRoute("webhooks.github", async (request) => {
  enforceRateLimit(request, "webhook:github", 300, 60_000);
  const secret = process.env.GITHUB_APP_WEBHOOK_SECRET?.trim() ?? "";
  if (!secret) {
    throw new ApiError(503, "WEBHOOK_DISABLED", "الويب هوك غير مُفعّل", "GitHub webhook is not configured.");
  }

  const raw = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  if (!verifyWebhookSignature(raw, signature, secret)) {
    throw ApiError.unauthorized("Invalid GitHub webhook signature");
  }

  const event = request.headers.get("x-github-event") ?? "unknown";
  const deliveryId = request.headers.get("x-github-delivery") ?? crypto.randomUUID();

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw ApiError.badRequest("Webhook body is not valid JSON");
  }

  const result = await handleGithubWebhook({ event, deliveryId, payload });
  return ok(result);
});

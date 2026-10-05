import type { PrismaClient } from "@/core/db/generated/prisma/client";

/**
 * Sliding-window rate limiter backed by PostgreSQL.
 * Each API key gets a configurable number of requests per window (default 100/min).
 * Returns { allowed, remaining, resetMs }.
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

const DEFAULT_MAX_REQUESTS = 100;
const DEFAULT_WINDOW_MS = 60_000; // 1 minute

export async function checkRateLimit(
  prisma: PrismaClient,
  apiKeyId: string,
  opts?: { maxRequests?: number; windowMs?: number },
): Promise<RateLimitResult> {
  const maxRequests = opts?.maxRequests ?? DEFAULT_MAX_REQUESTS;
  const windowMs = opts?.windowMs ?? DEFAULT_WINDOW_MS;
  const now = new Date();
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const nextWindow = new Date(windowStart.getTime() + windowMs);
  const resetMs = nextWindow.getTime() - now.getTime();

  // Upsert the counter for this key+window
  const record = await prisma.apiRateLimit.upsert({
    where: {
      apiKeyId_windowStart: { apiKeyId, windowStart },
    },
    create: { apiKeyId, windowStart, requestCount: 1 },
    update: { requestCount: { increment: 1 } },
  });

  const remaining = Math.max(0, maxRequests - record.requestCount);

  // Prune old windows (fire-and-forget)
  prisma.apiRateLimit
    .deleteMany({
      where: {
        apiKeyId,
        windowStart: { lt: new Date(windowStart.getTime() - windowMs) },
      },
    })
    .catch(() => {});

  return { allowed: record.requestCount <= maxRequests, remaining, resetMs };
}

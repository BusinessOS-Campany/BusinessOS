import { ApiError, ok, withRoute } from "@/core/http/api";
import { prisma } from "@/core/db/client";

export const dynamic = "force-dynamic";

export const GET = withRoute("health.database", async () => {
  const startedAt = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    throw new ApiError(503, "DATABASE_UNAVAILABLE", "قاعدة البيانات غير متاحة حاليًا", "Database unreachable");
  }
  return ok({
    status: "ok",
    latencyMs: Date.now() - startedAt,
  });
});

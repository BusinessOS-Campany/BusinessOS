import { z } from "zod";
import { ApiError, ok, withRoute } from "@/core/http/api";
import { requirePlatformAdmin } from "@/core/platform/gate";
import { prisma } from "@/core/db/client";

export const GET = withRoute("platform.announcements.list", async (request) => {
  await requirePlatformAdmin(request);
  const announcements = await prisma.announcement.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  return ok({ announcements });
});

const createAnnouncement = z.object({
  titleAr: z.string().min(2),
  titleEn: z.string().min(2),
  bodyAr: z.string().min(2),
  bodyEn: z.string().min(2),
  severity: z.enum(["info", "warning", "critical"]).default("info"),
  audience: z.enum(["all", "org"]).default("all"),
  organizationId: z.string().optional(),
  publish: z.boolean().default(true),
});

export const POST = withRoute("platform.announcements.create", async (request) => {
  const admin = await requirePlatformAdmin(request);
  const body = createAnnouncement.parse(await request.json().catch(() => null));
  if (body.audience === "org" && !body.organizationId) {
    throw ApiError.badRequest("organizationId is required when audience=org");
  }
  const announcement = await prisma.announcement.create({
    data: {
      titleAr: body.titleAr,
      titleEn: body.titleEn,
      bodyAr: body.bodyAr,
      bodyEn: body.bodyEn,
      severity: body.severity,
      audience: body.audience,
      organizationId: body.organizationId ?? null,
      publishedAt: body.publish ? new Date() : null,
      createdByUserId: admin.id,
    },
  });
  return ok({ announcement: { id: announcement.id } }, { status: 201 });
});

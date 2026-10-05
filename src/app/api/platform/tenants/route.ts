import { z } from "zod";
import { ok, withRoute } from "@/core/http/api";
import { requirePlatformAdmin } from "@/core/platform/gate";
import { prisma } from "@/core/db/client";

const listTenants = z.object({
  q: z.string().optional(),
  status: z.enum(["active", "suspended", "cancelled", "all"]).default("all"),
});

export const GET = withRoute("platform.tenants.list", async (request) => {
  await requirePlatformAdmin(request);
  const url = new URL(request.url);
  const parsed = listTenants.parse({
    q: url.searchParams.get("q") ?? undefined,
    status: url.searchParams.get("status") ?? "all",
  });

  const where = {
    ...(parsed.status !== "all" ? { status: parsed.status } : {}),
    ...(parsed.q
      ? { OR: [{ name: { contains: parsed.q, mode: "insensitive" as const } }, { slug: { contains: parsed.q } }] }
      : {}),
  };

  const tenants = await prisma.organization.findMany({
    where,
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      createdAt: true,
      plan: { select: { code: true, nameEn: true, nameAr: true } },
      _count: { select: { members: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return ok({ tenants });
});

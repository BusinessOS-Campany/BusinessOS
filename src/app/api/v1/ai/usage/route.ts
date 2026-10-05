import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { requireModule, requirePermission } from "@/core/db/tenant-guard";
import { getOrgSettings } from "@/core/tenancy/settings";
import { getUsageStats, assertAiQuota } from "@/core/ai/metering";
import { prisma } from "@/core/db/client";

export const GET = withRoute("v1.ai.usage", async (request) => {
  const { tenant } = await requireTenantContext(request);
  const settings = await getOrgSettings(tenant.organizationId);
  requireModule(settings, "ai");
  requirePermission(tenant, { ai: ["use"] });

  const planId = (settings as Record<string, unknown>).planId as string | null;
  const quota = await assertAiQuota(prisma, tenant.organizationId, planId);
  const stats = await getUsageStats(prisma, tenant.organizationId);

  return ok({ quota, stats });
});

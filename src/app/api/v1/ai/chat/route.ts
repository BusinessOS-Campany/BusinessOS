import { z } from "zod";
import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { requireModule, requirePermission } from "@/core/db/tenant-guard";
import { getOrgSettings } from "@/core/tenancy/settings";
import { chat } from "@/core/ai/copilot";
import { prisma } from "@/core/db/client";

const chatRequestSchema = z.object({
  message: z.string().min(1).max(4000),
  conversationId: z.string().optional(),
});

export const POST = withRoute("v1.ai.chat", async (request) => {
  const { tenant } = await requireTenantContext(request);
  const settings = await getOrgSettings(tenant.organizationId);
  requireModule(settings, "ai");
  requirePermission(tenant, { ai: ["use"] });
  const body = chatRequestSchema.parse(await request.json().catch(() => null));
  return ok(await chat(prisma, tenant, body));
});

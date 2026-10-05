import { z } from "zod";
import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { requireModule, requirePermission } from "@/core/db/tenant-guard";
import { getOrgSettings } from "@/core/tenancy/settings";
import { resumeCart } from "@/core/pos/service";
import { prisma } from "@/core/db/client";

export const POST = withRoute("v1.pos.resume", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requireModule(await getOrgSettings(tenant.organizationId), "sales");
  requirePermission(tenant, { sales: ["create"] });
  const { holdId } = z
    .object({ holdId: z.string().min(1) })
    .parse(await request.json().catch(() => null));
  return ok(await resumeCart(prisma, tenant, holdId));
});

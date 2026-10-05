import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { prisma } from "@/core/db/client";
import { listDevices } from "@/core/sync/service";

/**
 * GET /api/v1/devices — list registered sync devices for the current user.
 */
export const GET = withRoute("v1.devices.list", async (request) => {
  const { tenant } = await requireTenantContext(request);
  const devices = await listDevices(prisma, tenant.organizationId, tenant.userId);
  return ok({ devices });
});

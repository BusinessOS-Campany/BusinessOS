import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { requirePermission } from "@/core/db/tenant-guard";
import { prisma } from "@/core/db/client";

/** GET /api/v1/admin/workflows/executions — list execution logs. */
export const GET = withRoute("v1.admin.workflows.executions", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { workflows: ["read"] });

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);

  const executions = await prisma.workflowExecution.findMany({
    where: { organizationId: tenant.organizationId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return ok({ executions });
});

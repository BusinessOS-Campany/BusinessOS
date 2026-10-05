import { requirePermission } from "@/core/db/tenant-guard";
import { z } from "zod";
import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";

import { updateSessionStatus } from "@/core/sama/sessions";

const statusSchema = z.object({
  status: z.string().min(1),
});

export const PATCH = withRoute("v1.sama-center.sessions.status", async (request, context) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { appointments: ["update"] });

  const { id } = (context as { params: { id: string } }).params;
  const { status } = statusSchema.parse(await request.json().catch(() => null));

  const session = await updateSessionStatus(
    // @ts-expect-error prisma tx handled internally
    null,
    tenant.organizationId,
    id,
    status,
  );
  return ok(session);
});

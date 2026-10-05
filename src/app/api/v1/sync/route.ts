import { ok, withRoute, ApiError } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { prisma } from "@/core/db/client";
import { processSyncBatch } from "@/core/sync/service";
import { findUnauthorizedSyncOp } from "@/core/sync/permissions";
import { syncBatchSchema } from "@/core/sync/types";

/**
 * POST /api/v1/sync — batched offline sync endpoint.
 * Accepts an array of create/update/delete operations from the client outbox.
 * Each op is idempotent via idempotencyKey.
 */
export const POST = withRoute("v1.sync.batch", async (request) => {
  const { tenant } = await requireTenantContext(request);
  const raw = await request.json().catch(() => null);
  const body = syncBatchSchema.parse(raw);

  // Each operation is authorized on its own entity rather than the batch being
  // gated by one blanket permission, so a role cannot reach an entity it could
  // not write through the normal endpoints by routing it via the outbox.
  const denied = findUnauthorizedSyncOp(tenant.role, body.operations);
  if (denied) {
    throw new ApiError(
      403,
      "SYNC_OPERATION_FORBIDDEN",
      "عملية المزامنة غير مسموح بها لصلاحياتك.",
      "You do not have permission to perform this offline sync operation",
      { entity: denied.entity, operation: denied.op, module: denied.module },
    );
  }

  const result = await processSyncBatch(
    prisma,
    tenant.organizationId,
    tenant.userId,
    body,
  );

  return ok(result);
});

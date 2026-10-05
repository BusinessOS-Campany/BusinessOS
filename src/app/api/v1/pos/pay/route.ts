import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { requireModule, requirePermission } from "@/core/db/tenant-guard";
import { getOrgSettings } from "@/core/tenancy/settings";
import { payFromHold } from "@/core/pos/service";
import { posPaySchema } from "@/core/pos/types";
import { createSale } from "@/core/sales/service";
import { prisma } from "@/core/db/client";

export const POST = withRoute("v1.pos.pay", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requireModule(await getOrgSettings(tenant.organizationId), "sales");
  requirePermission(tenant, { sales: ["create"] });
  const body = posPaySchema.parse(await request.json().catch(() => null));
  if (!body.holdId) {
    return ok(
      await createSale(prisma, tenant, {
        warehouseId: body.warehouseId,
        customerId: body.customerId,
        cashAccountId: body.cashAccountId,
        items: body.items,
        cashPaid: body.cashPaid,
        notes: body.notes,
      }),
      { status: 201 },
    );
  }
  return ok(
    await payFromHold(prisma, tenant, body.holdId, body.cashPaid, body.cashAccountId),
    { status: 201 },
  );
});

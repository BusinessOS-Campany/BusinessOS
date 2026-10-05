import { z } from "zod";
import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { requirePermission } from "@/core/db/tenant-guard";
import { prisma } from "@/core/db/client";
import { generateExport, listExports } from "@/core/integrations/export";

const createSchema = z.object({
  entityType: z.enum(["products", "customers", "suppliers", "sales", "purchases", "inventory", "expenses"]),
  format: z.enum(["csv", "xlsx"]).default("csv"),
});

export const GET = withRoute("v1.admin.exports.list", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { integrations: ["read"] });

  const exports = await listExports(prisma, tenant.organizationId);
  return ok({ exports });
});

export const POST = withRoute("v1.admin.exports.create", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { integrations: ["export"] });
  const body = createSchema.parse(await request.json().catch(() => null));

  const result = await generateExport(prisma, tenant, body.entityType, body.format);
  return ok({ export: result }, { status: 201 });
});

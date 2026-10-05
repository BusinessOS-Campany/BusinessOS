import { z } from "zod";
import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { requireModule, requirePermission } from "@/core/db/tenant-guard";
import { getOrgSettings } from "@/core/tenancy/settings";
import { runReport, reportSpecSchema } from "@/core/reports/builder";

const bodySchema = z.object({
  spec: reportSpecSchema,
});

/** POST /api/v1/reports/build — whitelisted aggregate report compiler. */
export const POST = withRoute("v1.reports.build", async (request) => {
  const { tenant } = await requireTenantContext(request);
  const settings = await getOrgSettings(tenant.organizationId);
  requireModule(settings, "reports");
  requirePermission(tenant, { reports: ["read"] });

  const { spec } = bodySchema.parse(await request.json().catch(() => null));
  const result = await runReport(tenant.organizationId, spec);
  return ok(result);
});

import { z } from "zod";
import { ApiError, ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { requirePermission } from "@/core/db/tenant-guard";
import { prisma } from "@/core/db/client";
import { parseCsv, validateImport, commitImport } from "@/core/integrations/import";

const validateSchema = z.object({
  entityType: z.enum(["products", "customers", "suppliers", "opening_stock"]),
  csv: z.string().min(1),
  filename: z.string().default("upload.csv"),
});

const commitSchema = z.object({
  jobId: z.string().min(1),
  validRows: z.array(z.record(z.string(), z.string())).min(1),
});

export const POST = withRoute("v1.admin.imports.validate", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { integrations: ["manage"] });
  const body = validateSchema.parse(await request.json().catch(() => null));

  const { headers, rows } = parseCsv(body.csv);
  const result = await validateImport(prisma, tenant, body.entityType, headers, rows, body.filename);

  return ok(result);
});

export const PUT = withRoute("v1.admin.imports.commit", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { integrations: ["manage"] });
  const body = commitSchema.parse(await request.json().catch(() => null));

  const job = await prisma.importJob.findFirst({
    where: { id: body.jobId, organizationId: tenant.organizationId },
  });
  if (!job) throw ApiError.notFound("Import job not found");

  const result = await commitImport(prisma, tenant, body.jobId, body.validRows);
  return ok(result);
});

export const GET = withRoute("v1.admin.imports.list", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { integrations: ["read"] });

  const jobs = await prisma.importJob.findMany({
    where: { organizationId: tenant.organizationId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      entityType: true,
      filename: true,
      status: true,
      totalRows: true,
      validRows: true,
      invalidRows: true,
      committedRows: true,
      createdAt: true,
      completedAt: true,
    },
  });

  return ok({ jobs });
});

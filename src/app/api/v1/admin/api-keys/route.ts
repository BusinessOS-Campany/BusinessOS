import { z } from "zod";
import { ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { requirePermission } from "@/core/db/tenant-guard";
import { prisma } from "@/core/db/client";
import { createApiKey, listApiKeys, revokeApiKey } from "@/core/integrations/api-key";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.string()).min(1),
  expiresAt: z.string().datetime().optional(),
});

export const GET = withRoute("v1.admin.api-keys.list", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { integrations: ["read"] });
  const keys = await listApiKeys(prisma, tenant);
  return ok({ keys });
});

export const POST = withRoute("v1.admin.api-keys.create", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { integrations: ["manage"] });
  const body = createSchema.parse(await request.json().catch(() => null));

  const result = await createApiKey(prisma, tenant, {
    name: body.name,
    scopes: body.scopes,
    expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
  });

  return ok({ apiKey: result }, { status: 201 });
});

const revokeSchema = z.object({ keyId: z.string().min(1) });

export const DELETE = withRoute("v1.admin.api-keys.revoke", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { integrations: ["manage"] });

  const url = new URL(request.url);
  const keyId = url.searchParams.get("keyId");
  if (!keyId) {
    const body = await request.json().catch(() => null);
    const parsed = revokeSchema.parse(body);
    await revokeApiKey(prisma, tenant, parsed.keyId);
  } else {
    await revokeApiKey(prisma, tenant, keyId);
  }

  return ok({ revoked: true });
});

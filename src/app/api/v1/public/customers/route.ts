import { z } from "zod";
import { ApiError, ok, withRoute } from "@/core/http/api";
import { prisma } from "@/core/db/client";
import { resolveApiKey, requireScope } from "@/core/integrations/api-key";
import { checkRateLimit } from "@/core/integrations/rate-limit";
import { tenantFilter } from "@/core/db/tenant-guard";

function extractApiKey(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (!auth) return null;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

async function authenticateApiKey(
  request: Request,
  requiredScope: string,
): Promise<{ organizationId: string; scopes: string[] }> {
  const rawKey = extractApiKey(request);
  if (!rawKey) throw ApiError.unauthorized("Missing API key. Use Authorization: Bearer bos_xxx");
  const key = await resolveApiKey(prisma, rawKey);
  if (!key) throw ApiError.unauthorized("Invalid or expired API key");
  const rateLimit = await checkRateLimit(prisma, key.id);
  if (!rateLimit.allowed) {
    throw new ApiError(429, "RATE_LIMITED", "تم تجاوز الحد المسموح", "Rate limit exceeded", {
      resetMs: rateLimit.resetMs,
    });
  }
  requireScope(key.scopes, requiredScope);
  return { organizationId: key.organizationId, scopes: key.scopes };
}

export const GET = withRoute("v1.public.customers.list", async (request) => {
  const auth = await authenticateApiKey(request, "customers:read");

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 100);

  const customers = await prisma.customer.findMany({
    where: tenantFilter({ organizationId: auth.organizationId }, {
      isActive: true,
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: q }] } : {}),
    }),
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      creditLimit: true,
      balance: true,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return ok({ customers });
});

const createSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().max(30).optional(),
  email: z.string().email().optional(),
  creditLimit: z.number().int().min(0).default(0),
  notes: z.string().max(500).optional(),
});

export const POST = withRoute("v1.public.customers.create", async (request) => {
  const auth = await authenticateApiKey(request, "customers:create");
  const body = createSchema.parse(await request.json().catch(() => null));

  const customer = await prisma.customer.create({
    data: {
      organizationId: auth.organizationId,
      name: body.name,
      phone: body.phone,
      email: body.email,
      creditLimit: BigInt(body.creditLimit),
      notes: body.notes,
    },
  });
  return ok({ customer: { id: customer.id, name: customer.name } }, { status: 201 });
});

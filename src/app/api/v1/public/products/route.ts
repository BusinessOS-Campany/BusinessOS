import { z } from "zod";
import { ApiError, ok, withRoute } from "@/core/http/api";
import { prisma } from "@/core/db/client";
import { resolveApiKey, requireScope } from "@/core/integrations/api-key";
import { checkRateLimit } from "@/core/integrations/rate-limit";
import { tenantFilter } from "@/core/db/tenant-guard";

/**
 * Extract API key from Authorization header: "Bearer bos_xxx..."
 */
function extractApiKey(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (!auth) return null;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

/**
 * Authenticate an incoming request via API key + rate limit + scope check.
 * Returns the resolved key info or throws.
 */
async function authenticateApiKey(
  request: Request,
  requiredScope: string,
): Promise<{ organizationId: string; scopes: string[] }> {
  const rawKey = extractApiKey(request);
  if (!rawKey) throw ApiError.unauthorized("Missing API key. Use Authorization: Bearer bos_xxx");

  const key = await resolveApiKey(prisma, rawKey);
  if (!key) throw ApiError.unauthorized("Invalid or expired API key");

  // Rate limit
  const rateLimit = await checkRateLimit(prisma, key.id);
  if (!rateLimit.allowed) {
    throw new ApiError(429, "RATE_LIMITED", "تم تجاوز الحد المسموح", "Rate limit exceeded. Try again later", {
      resetMs: rateLimit.resetMs,
      remaining: rateLimit.remaining,
    });
  }

  // Scope check
  requireScope(key.scopes, requiredScope);

  return { organizationId: key.organizationId, scopes: key.scopes };
}

export const GET = withRoute("v1.public.products.list", async (request) => {
  const auth = await authenticateApiKey(request, "products:read");

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 100);

  const products = await prisma.product.findMany({
    where: tenantFilter({ organizationId: auth.organizationId }, {
      isActive: true,
      ...(q ? { OR: [{ sku: { contains: q, mode: "insensitive" } }, { nameAr: { contains: q } }, { barcode: q }] } : {}),
    }),
    select: {
      id: true,
      sku: true,
      barcode: true,
      nameAr: true,
      nameEn: true,
      salePrice: true,
      costPrice: true,
      taxRateBps: true,
      trackStock: true,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return ok({ products });
});

const createSchema = z.object({
  sku: z.string().min(1).max(64),
  barcode: z.string().min(1).max(64).optional(),
  nameAr: z.string().min(1).max(200),
  nameEn: z.string().max(200).optional(),
  costPrice: z.number().int().min(0),
  salePrice: z.number().int().min(0),
  taxRateBps: z.number().int().min(0).max(10000).default(0),
  trackStock: z.boolean().default(true),
});

export const POST = withRoute("v1.public.products.create", async (request) => {
  const auth = await authenticateApiKey(request, "products:create");
  const body = createSchema.parse(await request.json().catch(() => null));

  try {
    const product = await prisma.$transaction(async (tx) => {
      const p = await tx.product.create({
        data: {
          organizationId: auth.organizationId,
          sku: body.sku,
          barcode: body.barcode,
          nameAr: body.nameAr,
          nameEn: body.nameEn,
          costPrice: BigInt(body.costPrice),
          salePrice: BigInt(body.salePrice),
          taxRateBps: body.taxRateBps,
          trackStock: body.trackStock,
        },
      });
      return p;
    });
    return ok({ product: { id: product.id, sku: product.sku } }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && /unique/i.test(err.message)) {
      throw ApiError.conflict("SKU or barcode already exists");
    }
    throw err;
  }
});

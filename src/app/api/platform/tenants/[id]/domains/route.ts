import { z } from "zod";
import { ApiError, ok, withRoute } from "@/core/http/api";
import { requirePlatformAdmin } from "@/core/platform/gate";
import { prisma } from "@/core/db/client";
import { writeAuditLog } from "@/core/audit/service";
import {
  isPlatformDomain,
  isValidCustomDomain,
  normalizeCustomDomain,
} from "@/core/tenancy/host";

const body = z.object({ domain: z.string().max(253).optional() });

/** Reads the org's current custom-domain list (settings.domains). */
async function currentDomains(organizationId: string): Promise<string[]> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });
  const settings = (org?.settings ?? {}) as { domains?: unknown };
  return Array.isArray(settings.domains) ? (settings.domains as string[]) : [];
}

/** Persists domains + audit entry atomically. */
async function applyDomains(
  txArgs: { organizationId: string; userId: string },
  before: string[],
  after: string[],
  action: string,
) {
  const { organizationId, userId } = txArgs;
  return prisma.$transaction(async (tx) => {
    const org = await tx.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true },
    });
    const base =
      org?.settings && typeof org.settings === "object" && !Array.isArray(org.settings)
        ? (org.settings as Record<string, unknown>)
        : {};
    await tx.organization.update({
      where: { id: organizationId },
      data: { settings: { ...base, domains: after } as never },
    });
    await writeAuditLog(
      tx,
      { organizationId, userId },
      {
        action,
        entityType: "organization",
        entityId: organizationId,
        before: { domains: before },
        after: { domains: after },
      },
    );
    return after;
  });
}

export const POST = withRoute("platform.tenants.domains.add", async (request, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requirePlatformAdmin(request);
  const { id } = await ctx.params;
  const parsed = body.parse(await request.json().catch(() => null));
  const raw = parsed.domain;
  if (!raw) throw ApiError.badRequest("domain is required");

  const domain = normalizeCustomDomain(raw);
  if (!domain || !isValidCustomDomain(domain)) throw ApiError.badRequest("invalid domain");
  if (isPlatformDomain(domain)) throw ApiError.badRequest("platform domain is reserved");

  const taken = await prisma.organization.findFirst({
    where: { settings: { path: ["domains"], array_contains: [domain] } },
    select: { id: true },
  });
  if (taken && taken.id !== id) throw ApiError.badRequest("domain is already in use");

  const current = await currentDomains(id);
  const next = current.includes(domain) ? current : [...current, domain];

  const domains = await applyDomains({ organizationId: id, userId: admin.id }, current, next, "platform.tenant.domains.added");
  return ok({ domains });
});

export const DELETE = withRoute("platform.tenants.domains.remove", async (request, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requirePlatformAdmin(request);
  const { id } = await ctx.params;
  const parsed = body.parse(await request.json().catch(() => null));
  const raw = parsed.domain;
  if (!raw) throw ApiError.badRequest("domain is required");

  const domain = normalizeCustomDomain(raw);
  if (!domain) throw ApiError.badRequest("invalid domain");

  const current = await currentDomains(id);
  if (!current.includes(domain)) return ok({ domains: current });

  const next = current.filter((d) => d !== domain);
  const domains = await applyDomains({ organizationId: id, userId: admin.id }, current, next, "platform.tenant.domains.removed");
  return ok({ domains });
});
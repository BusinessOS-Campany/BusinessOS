import { z } from "zod";
import { randomUUID } from "node:crypto";
import { ApiError, ok, withRoute } from "@/core/http/api";
import { getTemplate } from "@/core/platform/templates/grocery";
import { prisma } from "@/core/db/client";
import { writeAuditLog } from "@/core/audit/service";

/** Maps template codes to app slugs that should be provisioned. */
const TEMPLATE_APP_MAP: Record<string, string> = {
  grocery: "grocery",
  clinic: "sama-center",
};

const bodySchema = z.object({
  templateCode: z.string(),
  redirectTo: z.string().optional(),
});

/**
 * POST /api/v1/org/install-template
 *
 * Provision a template's matching system for the *current* organization of a
 * signed-in user (skip signup). Real system setups ALWAYS land in the
 * platform approval queue (docs/AUDIT-2026.md — approval flow); the org
 * owner/admin resolves them at /platform-admin/approvals. Response includes
 * the target redirect URL.
 */
export const POST = withRoute("v1.org.installTemplate", async (request) => {
  const body = bodySchema.parse(await request.json().catch(() => null));

  const template = getTemplate(body.templateCode);
  if (!template) throw ApiError.badRequest("Invalid template code");

  const { requireTenantContext } = await import("@/core/tenancy/context");
  const ctx = await requireTenantContext(request);
  const organizationId = ctx.tenant.organizationId;

  const appSlug = TEMPLATE_APP_MAP[template.code];
  if (!appSlug) throw ApiError.badRequest("No app is linked to this template");

  const app = await prisma.app.findUnique({ where: { slug: appSlug } });
  if (!app) throw ApiError.notFound("Application not found");

  const appId = app.id;
  const redirectTo =
    body.redirectTo && body.redirectTo.startsWith("/")
      ? body.redirectTo
      : "/my-apps";

  // Idempotent: already installed → just go to my-apps.
  const existing = await prisma.organizationApp.findUnique({
    where: { organizationId_appId: { organizationId, appId } },
  });
  if (existing) {
    return ok({ installed: true, state: "installed", redirectTo });
  }

  // Real systems always require platform approval first.
  const prev = await prisma.organizationAppRequest.findFirst({
    where: { organizationId, appId },
  });
  if (prev && prev.status === "pending") {
    return ok({ installed: false, state: "pending", requestId: prev.id, redirectTo });
  }
  if (prev) {
    const reopened = await prisma.organizationAppRequest.update({
      where: { id: prev.id },
      data: { status: "pending", decidedByUserId: null, decidedAt: null, rejectReason: null },
    });
    await writeAuditLog(prisma, { organizationId, userId: ctx.tenant.userId }, {
      action: "platform.template.rerequested",
      entityType: "organizationAppRequest",
      entityId: appId,
      after: { templateCode: template.code, appSlug },
    });
    return ok({ installed: false, state: "pending", requestId: reopened.id, redirectTo });
  }

  const created = await prisma.organizationAppRequest.create({
    data: {
      id: randomUUID(),
      organizationId,
      appId,
      requestedByUserId: ctx.tenant.userId,
      status: "pending",
      note: `template:${template.code}`,
    },
  });

  await writeAuditLog(prisma, { organizationId, userId: ctx.tenant.userId }, {
    action: "platform.template.requested",
    entityType: "organizationAppRequest",
    entityId: appId,
    after: { templateCode: template.code, appSlug },
  });

  return ok({ installed: false, state: "pending", requestId: created.id, redirectTo });
});

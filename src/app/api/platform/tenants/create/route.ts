import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ApiError, ok, withRoute } from "@/core/http/api";
import { requirePlatformAdmin } from "@/core/platform/gate";
import { getTemplate } from "@/core/platform/templates/grocery";
import { prisma } from "@/core/db/client";
import { writeAuditLog } from "@/core/audit/service";
import { onOrganizationCreated } from "@/core/org-vault/on-create";

const createTenant = z.object({
  name: z.string().min(2).max(80),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/),
  planCode: z.string().default("trial"),
  ownerEmail: z.string().email(),
  templateCode: z.string().optional(),
});

/**
 * Creates a tenant + its owner membership in ONE transaction.
 * An optional industry template pre-configures enabled modules + settings.
 */
export const POST = withRoute("platform.tenants.create", async (request) => {
  const admin = await requirePlatformAdmin(request);
  const body = createTenant.parse(await request.json().catch(() => null));

  const owner = await prisma.user.findUnique({ where: { email: body.ownerEmail } });
  if (!owner) throw ApiError.badRequest("ownerEmail does not exist — create the user first");
  if (body.templateCode && !getTemplate(body.templateCode)) {
    throw ApiError.badRequest("Unknown templateCode");
  }
  const template = getTemplate(body.templateCode);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const plan = await tx.plan.findUnique({ where: { code: body.planCode } });
      const org = await tx.organization.create({
        data: {
          id: randomUUID(),
          name: body.name,
          slug: body.slug,
          status: "active",
          planId: plan?.id ?? null,
          ...(template
            ? {
                templateCode: template.code,
                settings: { ...template.settings, modulesEnabled: template.modules } as never,
              }
            : {}),
        },
      });
      await tx.member.create({
        data: { id: randomUUID(), organizationId: org.id, userId: owner.id, role: "owner" },
      });
      await writeAuditLog(tx, { organizationId: org.id, userId: admin.id }, {
        action: "platform.tenant.created",
        entityType: "organization",
        entityId: org.id,
        after: {
          name: org.name,
          slug: org.slug,
          planCode: plan?.code ?? null,
          ownerEmail: owner.email,
          templateCode: template?.code ?? null,
        },
      });
      return org;
    });

    // The tenant exists, so it gets its folder under `orginazition/`. A 201
    // therefore always means the folder exists too; `initdb` is queued.
    await onOrganizationCreated({ id: result.id, slug: result.slug, name: result.name });

    return ok(
      {
        tenant: { id: result.id, name: result.name, slug: result.slug, status: result.status },
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof Error && /unique/i.test(err.message)) {
      throw ApiError.conflict("Slug already in use");
    }
    throw err;
  }
});

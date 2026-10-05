import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ApiError, ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { requirePermission, tenantFilter } from "@/core/db/tenant-guard";
import { prisma } from "@/core/db/client";
import { writeAuditLog } from "@/core/audit/service";

export const GET = withRoute("v1.admin.users.list", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { users: ["read"] });
  const members = await prisma.member.findMany({
    where: tenantFilter(tenant),
    select: {
      id: true,
      role: true,
      createdAt: true,
      user: { select: { id: true, email: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return ok({ members });
});

const addMember = z.object({
  email: z.string().email(),
  role: z.enum(["owner", "admin", "manager", "cashier", "accountant", "viewer"]),
});

/**
 * Adds an existing platform user to this org with a role. Creating brand-new
 * accounts from the tenant console is intentionally out of scope (no SMTP
 * yet): invite existing users or share sign-up; M12 adds invitation emails.
 */
export const POST = withRoute("v1.admin.users.add", async (request) => {
  const { tenant } = await requireTenantContext(request);
  requirePermission(tenant, { users: ["invite"] });
  const body = addMember.parse(await request.json().catch(() => null));

  const user = await prisma.user.findUnique({ where: { email: body.email } });
  if (!user) throw ApiError.notFound("No platform user with that email — ask them to sign up first");

  try {
    const member = await prisma.member.create({
      data: {
        id: randomUUID(),
        organizationId: tenant.organizationId,
        userId: user.id,
        role: body.role,
      },
    });
    await prisma.$transaction((tx) =>
      writeAuditLog(tx, tenant, {
        action: "member.added",
        entityType: "member",
        entityId: member.id,
        after: { email: user.email, role: body.role },
      }),
    );
    return ok({ member: { id: member.id, role: member.role } }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && /unique/i.test(err.message)) {
      throw ApiError.conflict("User is already a member of this organization");
    }
    throw err;
  }
});

import { NextResponse } from "next/server";
import { ApiError, ok, withRoute } from "@/core/http/api";
import { requirePlatformAdmin } from "@/core/platform/gate";
import { prisma } from "@/core/db/client";
import { writeAuditLog } from "@/core/audit/service";
import { auth } from "@/core/auth/server";

/**
 * Platform impersonation. Starts a session AS the target user (admin plugin),
 * records an immutable platform-realm audit entry, and forwards the new
 * session cookie to the caller.
 * Safety rule: platform admins can never be impersonated.
 */
export const POST = withRoute("platform.users.impersonate", async (request, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requirePlatformAdmin(request);
  const { id } = await ctx.params;

  if (id === admin.id) throw ApiError.badRequest("Cannot impersonate yourself");
  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, role: true },
  });
  if (!target) throw ApiError.notFound("User not found");
  if (target.role === "admin") throw ApiError.forbidden("Platform admins cannot be impersonated");

  const result = await auth.api.impersonateUser({
    body: { userId: target.id },
    headers: request.headers,
    returnHeaders: true,
  });

  await prisma.$transaction((tx) =>
    writeAuditLog(tx, { organizationId: null, userId: admin.id }, {
      action: "platform.user.impersonation_started",
      entityType: "user",
      entityId: target.id,
      after: { email: target.email },
    }),
  );

  const response = ok({ impersonated: { userId: target.id, email: target.email } });
  for (const cookie of result.headers.getSetCookie()) {
    response.headers.append("set-cookie", cookie);
  }
  return response as NextResponse;
});

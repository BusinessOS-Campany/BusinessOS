import { NextResponse } from "next/server";
import { ApiError, ok, withRoute } from "@/core/http/api";
import { prisma } from "@/core/db/client";
import { writeAuditLog } from "@/core/audit/service";
import { auth } from "@/core/auth/server";

/**
 * Ends an active impersonation and hands the browser back to the admin's own
 * session. NOTE: this runs AS the impersonated user by design — the gate is
 * the presence of `session.impersonatedBy`, not the platform-admin role.
 */
export const POST = withRoute("platform.users.stop_impersonating", async (request) => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) throw ApiError.unauthorized();

  const adminId = (session.session as { impersonatedBy?: string | null }).impersonatedBy;
  if (!adminId) throw ApiError.badRequest("This session is not an impersonation");

  const result = await auth.api.stopImpersonating({
    headers: request.headers,
    returnHeaders: true,
  });

  await prisma.$transaction((tx) =>
    writeAuditLog(tx, { organizationId: null, userId: adminId }, {
      action: "platform.user.impersonation_stopped",
      entityType: "user",
      entityId: session.user.id,
      after: { email: session.user.email },
    }),
  );

  const response = ok({ stopped: true });
  for (const cookie of result.headers.getSetCookie()) {
    response.headers.append("set-cookie", cookie);
  }
  return response as NextResponse;
});

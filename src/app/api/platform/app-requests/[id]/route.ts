import { z } from "zod";
import { ApiError, ok, withRoute } from "@/core/http/api";
import { requirePlatformAdmin } from "@/core/platform/gate";
import { prisma } from "@/core/db/client";
import { writeAuditLog } from "@/core/audit/service";
import { installSystemForOrg } from "@/core/apps/service";
import { warmOrgRuntime } from "@/core/systems/runtime/warm";

const decideBody = z.object({
  action: z.enum(["approve", "reject"]),
  reason: z.string().max(500).optional(),
});

/**
 * Approves or rejects a tenant's request for a system.
 *
 * This is the ONLY place `installSystemForOrg` runs for a tenant: the
 * customer-facing routes (`/api/v1/apps/[slug]/request` and its `/install` alias)
 * only ever write a pending `organizationAppRequest`, so approving here is the
 * single point where a human decision becomes a real system.
 *
 * Approve: `installSystemForOrg` writes the org's install row, registers its
 * vault and clones the source, rolling the row back if the copy fails. Reject:
 * marks the request rejected; nothing is installed.
 */
export const POST = withRoute(
  "platform.appRequests.decide",
  async (request, ctx: { params: Promise<{ id: string }> }) => {
    const admin = await requirePlatformAdmin(request);
    const { id } = await ctx.params;
    const body = decideBody.parse(await request.json().catch(() => null));

    const req = await prisma.organizationAppRequest.findUnique({
      where: { id },
      select: {
        id: true,
        organizationId: true,
        appId: true,
        status: true,
        requestedByUserId: true,
        organization: { select: { name: true, slug: true } },
        app: { select: { slug: true, name: true, nameAr: true, version: true } },
      },
    });
    if (!req) throw ApiError.notFound("App request not found");
    if (req.status !== "pending" && req.status !== "rejected") {
      throw ApiError.conflict("App request is not pending or rejected");
    }

    const note = {
      reason: body.reason,
      requesterId: req.requestedByUserId,
    } as Record<string, string | undefined>;

    if (body.action === "reject") {
      await prisma.$transaction(async (tx) => {
        await tx.organizationAppRequest.update({
          where: { id },
          data: {
            status: "rejected",
            decidedByUserId: admin.id,
            decidedAt: new Date(),
            rejectReason: body.reason ?? null,
          },
        });
        await writeAuditLog(tx, { organizationId: req.organizationId, userId: admin.id }, {
          action: "platform.app.rejected",
          entityType: "organizationAppRequest",
          entityId: req.appId,
          after: { ...note, orgName: req.organization.name, appSlug: req.app.slug },
        });
      });
      return ok({ request: { id, status: "rejected" } });
    }

    // The install itself: the org's `organization_apps` row, its vault entry and
    // its private copy of the system's source. This is the only place a tenant's
    // queued request turns into a system — the customer-facing routes only ever
    // write a pending row, so this is the human decision the queue exists for.
    //
    // Outside the transaction on purpose: it clones files and registers a
    // database, and it rolls its own row back if the copy cannot be written.
    // Holding a transaction open across that would mean a failed clone rolls back
    // the approval too, leaving a request marked pending with nothing to show.
    const installed = await installSystemForOrg(req.organizationId, {
      slug: req.app.slug,
      userId: admin.id,
    });

    // Warm the org's runtime now instead of on the customer's first open, so
    // that visit is already served. Deliberately not awaited: a build takes
    // minutes and the approval must not. A failure is recorded where the
    // install-status endpoint can report it, not swallowed.
    if (installed.state !== "pending") {
      void warmOrgRuntime({
        orgId: req.organizationId,
        orgSlug: req.organization.slug,
        systemSlug: req.app.slug,
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.organizationAppRequest.update({
        where: { id },
        data: {
          status: "approved",
          decidedByUserId: admin.id,
          decidedAt: new Date(),
          rejectReason: null,
        },
      });
      await writeAuditLog(tx, { organizationId: req.organizationId, userId: admin.id }, {
        action: "platform.app.approved",
        entityType: "organizationAppRequest",
        entityId: req.appId,
        after: { ...note, orgName: req.organization.name, appSlug: req.app.slug, state: installed.state },
      });
    });

    return ok({
      request: { id, status: "approved" },
      app: req.app.slug,
      state: installed.state,
      route: installed.route,
    });
  },
);
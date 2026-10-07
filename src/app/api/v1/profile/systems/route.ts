import { z } from "zod";
import { ApiError, checkSessionRateLimit, ok, withRoute } from "@/core/http/api";
import { requireTenantContext } from "@/core/tenancy/context";
import { requirePermission } from "@/core/db/tenant-guard";
import { prisma } from "@/core/db/client";
import { writeAuditLog } from "@/core/audit/service";
import {
  cloneInstalledSystemByRow,
  setOrgSystemDisplayName,
  uninstallSystemForOrg,
} from "@/core/apps/service";
import { getProfileOverview, requireProfileSession } from "@/core/profile/service";
import { confirmCredentialForOrg } from "@/core/systems/credentials";

/**
 * Per-org system management from the profile systems tab.
 *
 *   PATCH  /api/v1/profile/systems   rename one installed system
 *   POST   /api/v1/profile/systems   re-clone the system's files into this org
 *   PUT    /api/v1/profile/systems   activate direct sign-in for one system
 *   DELETE /api/v1/profile/systems   uninstall a system (stop runtime + drop the row)
 *
 * The rename is stored on the `organizationApp` row, never the `app` catalog
 * row: one customer naming its copy "البيانات الشخصية" must not rename the
 * system for the other 195 tenants.
 *
 * `requireTenantContext` derives the org from the session's active
 * organization, and the `appId` in the body is only used to look the install up
 * *inside that org* — a foreign `appId` therefore 404s rather than reaching
 * another tenant's row.
 */

const renameSchema = z
  .object({
    appId: z.string().min(1).max(64),
    /** Empty string clears the override and falls back to the catalog name. */
    displayName: z.string().max(120),
  })
  .strict();

export const PATCH = withRoute(
  "v1.profile.systems.rename",
  async (request) => {
    const ctx = await requireTenantContext(request);
    requirePermission(ctx.tenant, { systems: ["manage"] });

    const body = renameSchema.parse(await request.json().catch(() => null));
    const organizationId = ctx.tenant.organizationId;

    const before = await prisma.organizationApp.findUnique({
      where: { organizationId_appId: { organizationId, appId: body.appId } },
      select: { id: true, settings: true, app: { select: { slug: true, name: true } } },
    });
    if (!before) throw ApiError.notFound("System is not installed in this organization");

    const { displayName } = await setOrgSystemDisplayName(
      organizationId,
      body.appId,
      body.displayName,
    );

    await writeAuditLog(prisma, { organizationId, userId: ctx.tenant.userId }, {
      action: "profile.system.renamed",
      entityType: "organizationApp",
      entityId: before.id,
      after: { appSlug: before.app.slug, displayName },
    });

    // Same shape as every other profile mutation, so the client can replace its
    // whole state instead of patching one card by hand.
    return ok(await getProfileOverview(await requireProfileSession(request.headers)));
  },
);

/** Re-clone a system's files into this org. Idempotent — a no-op once cloned. */
export const POST = withRoute(
  "v1.profile.systems.clone",
  async (request) => {
    const ctx = await requireTenantContext(request);
    requirePermission(ctx.tenant, { systems: ["manage"] });

    const body = z.object({ appId: z.string().min(1).max(64) }).strict().parse(
      await request.json().catch(() => null),
    );

    const orgApp = await prisma.organizationApp.findUnique({
      where: { organizationId_appId: { organizationId: ctx.tenant.organizationId, appId: body.appId } },
      select: { id: true, app: { select: { slug: true } } },
    });
    if (!orgApp) throw ApiError.notFound("System is not installed in this organization");

    const result = await cloneInstalledSystemByRow(orgApp.id);

    await writeAuditLog(prisma, { organizationId: ctx.tenant.organizationId, userId: ctx.tenant.userId }, {
      action: "profile.system.cloned",
      entityType: "organizationApp",
      entityId: orgApp.id,
      after: { appSlug: orgApp.app.slug, cloned: result.cloned, fresh: result.fresh, files: result.files },
    });

    return ok(result);
  },
);

const uninstallSchema = z.object({ appId: z.string().min(1).max(64) }).strict();

/**
 * DELETE /api/v1/profile/systems — remove one installed system from this org.
 *
 * Stops the org's runtime for the system, then removes the `organizationApp`
 * row, so the card returns to "installable" and the queued system can be
 * requested again. The cloned files and the org's private database are kept —
 * this is not a data wipe — and the response says so explicitly. Gated on
 * `systems:manage` like every other mutation on this tab, and the `appId` is
 * looked up inside the active org, so a foreign id 404s rather than reaching
 * another tenant's install.
 */
export const DELETE = withRoute("v1.profile.systems.uninstall", async (request) => {
  const ctx = await requireTenantContext(request);
  requirePermission(ctx.tenant, { systems: ["manage"] });

  const body = uninstallSchema.parse(await request.json().catch(() => null));

  const before = await prisma.organizationApp.findUnique({
    where: { organizationId_appId: { organizationId: ctx.tenant.organizationId, appId: body.appId } },
    select: { id: true, app: { select: { slug: true } } },
  });
  if (!before) throw ApiError.notFound("System is not installed in this organization");

  const result = await uninstallSystemForOrg(ctx.tenant.organizationId, before.app.slug);

  await writeAuditLog(prisma, { organizationId: ctx.tenant.organizationId, userId: ctx.tenant.userId }, {
    action: "profile.system.uninstalled",
    entityType: "organizationApp",
    entityId: before.id,
    after: {
      appSlug: before.app.slug,
      stopped: result.stopped,
      filesKept: result.filesKept,
      databaseKept: result.databaseKept,
    },
  });

  return ok({
    uninstalled: { appSlug: before.app.slug, ...result },
    profile: await getProfileOverview(await requireProfileSession(request.headers)),
  });
});

const confirmCredentialSchema = z
  .object({
    appId: z.string().min(1).max(64),
    currentPassword: z.string().min(1).max(128),
  })
  .strict();

/**
 * PUT /api/v1/profile/systems — activate direct login for one installed system.
 *
 * Members who joined before passwords were mirrored have no stored digest, so
 * they reach their systems only through the platform's gateway. This is the one
 * moment they can fix that themselves: they type the password they already use
 * on the platform, it is verified against the platform's own credential store,
 * and only then is a bcrypt copy stored for this org's copy of that system.
 *
 * Why verify rather than store: an endpoint that accepted any password and wrote
 * a digest would let anyone who can reach it set a login in a customer's system.
 * Verifying first means the only thing this can do is copy a credential the
 * member demonstrably already holds.
 *
 * The `appId` is looked up inside the active org and the caller must be a member
 * of it, so this cannot write a digest for another tenant or for a system the
 * org does not have.
 */
export const PUT = withRoute("v1.profile.systems.confirmCredential", async (request) => {
  const ctx = await requireTenantContext(request);
  const body = confirmCredentialSchema.parse(await request.json().catch(() => null));

  const orgApp = await prisma.organizationApp.findUnique({
    where: { organizationId_appId: { organizationId: ctx.tenant.organizationId, appId: body.appId } },
    select: { id: true, app: { select: { slug: true } } },
  });
  if (!orgApp) throw ApiError.notFound("System is not installed in this organization");

  // Same limiter the password-change endpoint uses: this verifies a password, so
  // it must not be a free oracle for guessing one.
  const limit = checkSessionRateLimit(`profile:confirm:${ctx.tenant.userId}`, 5, 15 * 60_000);
  if (!limit.allowed) {
    throw new ApiError(
      429,
      "RATE_LIMITED",
      "محاولات كثيرة، حاول لاحقًا",
      "Too many attempts",
    );
  }

  const result = await confirmCredentialForOrg({
    userId: ctx.tenant.userId,
    organizationId: ctx.tenant.organizationId,
    appId: body.appId,
    currentPassword: body.currentPassword,
  });

  if (!result.stored) {
    // `no_password_account` is a social login: there is nothing to confirm, and
    // saying so is more useful than a generic failure.
    if (result.reason === "no_password_account") {
      throw ApiError.badRequest(
        "This account signs in with a social provider, so there is no password to copy",
      );
    }
    // Deliberately vague on a wrong password, matching the change-password endpoint.
    if (result.reason === "wrong_password") {
      throw ApiError.badRequest("That password is not correct");
    }
    throw ApiError.badRequest("This system is not available for direct sign-in");
  }

  await writeAuditLog(prisma, { organizationId: ctx.tenant.organizationId, userId: ctx.tenant.userId }, {
    action: "profile.system.credential_confirmed",
    entityType: "organizationApp",
    entityId: orgApp.id,
    after: { appSlug: orgApp.app.slug, username: result.username },
  });

  // The clone takes the digest on its next request, and the response tells the
  // client what to type there, so the member is not left guessing.
  return ok({ stored: true, username: result.username });
});

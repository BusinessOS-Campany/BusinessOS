import { z } from "zod";
import { ApiError, checkSessionRateLimit, ok, withRoute } from "@/core/http/api";
import { sharedPrisma } from "@/core/db/client";
import { auth } from "@/core/auth/server";
import { writeAuditLog } from "@/core/audit/service";
import {
  assertSessionOwnedBy, getProfileOverview, requireProfileSession,
  updateProfile, UsernameTakenError,
} from "@/core/profile/service";
import {
  LIMITS, normalizeMediaRef, normalizeUsername, sanitizeMultiline, sanitizeText,
} from "@/core/profile/normalize";
import { storeCredentialsForUser } from "@/core/systems/credentials";
import { syncCredentialsForUser, runningRuntimeTarget } from "@/core/systems/runtime/sync";

/**
 * Own-profile API. Every handler derives the user from the Better Auth session
 * and ignores any user id in the request, so there is no IDOR surface here.
 * Responses are shaped by `getProfileOverview`, which is the same code the
 * server component uses for the first paint — the client refetch and the SSR
 * payload can never disagree.
 */

/* ── GET ──────────────────────────────────────────────────────────────────── */

/** GET /api/v1/profile — identity, real stats, organizations, systems, sessions. */
export const GET = withRoute("v1.profile.get", async (request) => {
  const profile = await requireProfileSession(request.headers);
  return ok(await getProfileOverview(profile));
});

/* ── PATCH ────────────────────────────────────────────────────────────────── */

const socialsSchema = z
  .object({
    website: z.string().max(LIMITS.url).optional().nullable(),
    github: z.string().max(LIMITS.url).optional().nullable(),
    linkedin: z.string().max(LIMITS.url).optional().nullable(),
    twitter: z.string().max(LIMITS.url).optional().nullable(),
    facebook: z.string().max(LIMITS.url).optional().nullable(),
    instagram: z.string().max(LIMITS.url).optional().nullable(),
    links: z
      .array(z.object({ id: z.string().max(40), label: z.string().max(LIMITS.linkLabel), url: z.string().max(LIMITS.url) }))
      .max(LIMITS.socialLinks)
      .optional(),
  })
  .strict();

const extrasSchema = z
  .object({
    jobTitle: z.string().max(LIMITS.jobTitle).optional().nullable(),
    location: z.string().max(LIMITS.location).optional().nullable(),
    city: z.string().max(LIMITS.city).optional().nullable(),
  })
  .strict();

const preferencesSchema = z
  .object({
    emailNotifications: z.boolean().optional(),
    marketing: z.boolean().optional(),
    aiAssist: z.boolean().optional(),
  })
  .strict();

const patchSchema = z
  .object({
    name: z.string().optional(),
    username: z.string().max(LIMITS.usernameMax + 1).nullable().optional(),
    bio: z.string().max(LIMITS.bio + 20).nullable().optional(),
    image: z.string().max(500).nullable().optional(),
    coverImage: z.string().max(500).nullable().optional(),
    socials: socialsSchema.optional(),
    extras: extrasSchema.optional(),
    preferences: preferencesSchema.optional(),
    locale: z.enum(["ar", "en"]).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });

/** PATCH /api/v1/profile — update the signed-in user's own profile. Audited. */
export const PATCH = withRoute("v1.profile.patch", async (request) => {
  const profile = await requireProfileSession(request.headers);

  const limit = checkSessionRateLimit(`profile:patch:${profile.userId}`, 20, 60_000);
  if (!limit.allowed) throw new ApiError(429, "RATE_LIMITED", "محاولات كثيرة، حاول لاحقًا", "Too many updates, slow down");

  const body = patchSchema.parse(await request.json().catch(() => null));

  // Re-validate and normalise everything here. The client runs the same helpers
  // for instant feedback, but the server is the only authority.
  const patch: Parameters<typeof updateProfile>[1] = {};
  const changed: string[] = [];

  if (body.name !== undefined) {
    const name = sanitizeText(body.name, LIMITS.name);
    if (name === "") throw ApiError.badRequest("Name cannot be empty");
    patch.name = name;
    changed.push("name");
  }
  if (body.bio !== undefined) {
    patch.bio = sanitizeMultiline(body.bio, LIMITS.bio) || null;
    changed.push("bio");
  }
  if (body.username !== undefined) {
    if (body.username === null || body.username.trim() === "") {
      patch.username = null;
    } else {
      const result = normalizeUsername(body.username);
      if (!result.ok) throw ApiError.badRequest("Invalid username", { reason: result.reason });
      patch.username = result.value;
    }
    changed.push("username");
  }
  if (body.image !== undefined) {
    patch.image = body.image === null ? null : normalizeMediaRef(body.image);
    if (body.image !== null && patch.image === null) throw ApiError.badRequest("Invalid image reference");
    changed.push("image");
  }
  if (body.coverImage !== undefined) {
    patch.coverImage = body.coverImage === null ? null : normalizeMediaRef(body.coverImage);
    if (body.coverImage !== null && patch.coverImage === null) throw ApiError.badRequest("Invalid cover reference");
    changed.push("coverImage");
  }
  if (body.socials !== undefined) {
    patch.socials = body.socials;
    changed.push("socials");
  }
  if (body.extras !== undefined) {
    patch.extras = body.extras;
    changed.push("extras");
  }
  if (body.preferences !== undefined) {
    patch.preferences = body.preferences;
    changed.push("preferences");
  }
  if (body.locale !== undefined) {
    patch.locale = body.locale;
    changed.push("locale");
  }

  try {
    // `tx` is handed to updateProfile so the user row and the audit entry are
    // one atomic unit. Passing only the audit write would leave the profile
    // update running outside the transaction, which is not what this used to do.
    await sharedPrisma.$transaction(async (tx) => {
      await updateProfile(profile.userId, patch, tx);
      await writeAuditLog(
        tx,
        { organizationId: null, userId: profile.userId },
        { action: "profile.patched", entityType: "user", entityId: profile.userId, after: { changed }, actorUserId: profile.userId },
      );
    });
  } catch (err) {
    // A unique violation on users_username_key is the last line of defence; the
    // explicit check in updateProfile normally catches it first.
    if (err instanceof UsernameTakenError) throw ApiError.conflict("That username is taken");
    if (typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002") {
      throw ApiError.conflict("That username is taken");
    }
    throw err;
  }

  return ok(await getProfileOverview(profile));
});

/* ── password ─────────────────────────────────────────────────────────────── */

const passwordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
  revokeOtherSessions: z.boolean().optional(),
});

/** POST /api/v1/profile — change password through Better Auth. Audited. */
export const POST = withRoute("v1.profile.password", async (request) => {
  const profile = await requireProfileSession(request.headers);

  const limit = checkSessionRateLimit(`profile:password:${profile.userId}`, 5, 15 * 60_000);
  if (!limit.allowed) {
    throw new ApiError(429, "RATE_LIMITED", "محاولات كثيرة، حاول لاحقًا", "Too many password attempts");
  }

  const body = passwordSchema.parse(await request.json().catch(() => null));

  try {
    await auth.api.changePassword({
      headers: request.headers,
      body: {
        currentPassword: body.currentPassword,
        newPassword: body.newPassword,
        revokeOtherSessions: body.revokeOtherSessions ?? true,
      },
    });
  } catch {
    // Deliberately vague: never reveal whether the account exists.
    throw ApiError.badRequest("Invalid current password or password policy failed");
  }

  await sharedPrisma.$transaction(async (tx) => {
    await writeAuditLog(
      tx,
      { organizationId: null, userId: profile.userId },
      { action: "profile.password_changed", entityType: "user", entityId: profile.userId, actorUserId: profile.userId },
    );
  });

  // This is the one place outside signup where the platform still holds the new
  // plaintext, so it is where the per-org digests are refreshed. Each org's own
  // copy of a system has to hear about it or its old hash silently stops
  // matching; a copy that is not running picks the new digest up on its next
  // boot. Failures are swallowed inside, so a stopped clone cannot fail a
  // password change that already succeeded on the platform.
  const stored = await storeCredentialsForUser(profile.userId, body.newPassword);
  const pushed = await syncCredentialsForUser(profile.userId, runningRuntimeTarget);

  return ok({
    changed: true,
    otherSessionsRevoked: body.revokeOtherSessions ?? true,
    /** Digests refreshed across the member's installed systems. */
    systemCredentials: { stored, pushed },
  });
});

/* ── session revocation ───────────────────────────────────────────────────── */

const revokeSchema = z
  .object({
    sessionId: z.string().min(1).optional(),
    revokeOthers: z.boolean().optional(),
    revokeAll: z.boolean().optional(),
  })
  .strict();

/**
 * DELETE /api/v1/profile — revoke a session by ID, all others, or everything.
 *
 * The client sends a session *id*, never a token. The token is looked up
 * server-side after an ownership check, so a leaked id cannot be used to end
 * somebody else's session and no token is ever exposed to the browser.
 */
export const DELETE = withRoute("v1.profile.sessions.revoke", async (request) => {
  const profile = await requireProfileSession(request.headers);
  const body = revokeSchema.parse(await request.json().catch(() => ({})));

  let revokedId: string | null = null;

  if (body.revokeAll) {
    await auth.api.revokeSessions({ headers: request.headers });
  } else if (body.revokeOthers) {
    await auth.api.revokeOtherSessions({ headers: request.headers });
  } else if (body.sessionId) {
    if (body.sessionId === profile.sessionId) {
      // Ending your own session is a sign-out, not a revocation.
      throw ApiError.badRequest("Use sign out to end the current session");
    }
    await assertSessionOwnedBy(profile.userId, body.sessionId);
    const row = await sharedPrisma.session.findUnique({
      where: { id: body.sessionId },
      select: { token: true },
    });
    if (!row) throw ApiError.notFound("Session not found");
    await auth.api.revokeSession({ headers: request.headers, body: { token: row.token } });
    revokedId = body.sessionId;
  } else {
    throw ApiError.badRequest("Provide sessionId, revokeOthers or revokeAll");
  }

  await sharedPrisma.$transaction(async (tx) => {
    await writeAuditLog(
      tx,
      { organizationId: null, userId: profile.userId },
      {
        action: "profile.session_revoked",
        entityType: "session",
        entityId: revokedId ?? (body.revokeAll ? "all" : "others"),
        actorUserId: profile.userId,
      },
    );
  });

  return ok({ revoked: true, sessionId: revokedId });
});

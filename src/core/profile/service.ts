import { sharedPrisma } from "@/core/db/client";
import { auth } from "@/core/auth/server";
import { ApiError } from "@/core/http/api";
import { displayIdentifier, findCountry, formatInternational, isInternalAuthEmail } from "@/core/auth/identifier";
import { dbSchema } from "@/core/db/client";
import { openRouteForOrgSlug } from "@/core/systems/catalog";
import { listSystemSources } from "@/core/org-vault/system-sources";
import { orgSystemDisplayName } from "@/core/apps/settings";
import {
  normalizeExtras, normalizePreferences, normalizeSocials, normalizeMediaRef, normalizeUsername,
  sanitizeMultiline, sanitizeText, LIMITS, type Preferences,
} from "./normalize";
import type {
  ActivityDay, ActivityItem, ProfileActivity, ProfileIdentity,
  ProfileOrg, ProfileOverview, ProfileSessionView, ProfileSystem,
  ProfileSystemAccess,
} from "./types";

/**
 * Server-only data layer for the signed-in user's own profile.
 *
 * Every function here takes the user id from the Better Auth session, never from
 * the request body or a query parameter, so there is no route to read or write
 * somebody else's profile. `/profile` is private: there is no public profile
 * endpoint.
 *
 * Client boundary: these are the shared `businessos` tables, so they are read
 * through `sharedPrisma` explicitly. `auditLog` is NOT in the db client's
 * SHARED_MODELS allowlist (it is a per-tenant business table that is also
 * materialised in the shared schema), so going through the routing `prisma`
 * proxy here would silently read an empty tenant schema. Audit reads must use
 * `sharedPrisma.auditLog` and must be schema-qualified in raw SQL — the physical
 * table is `audit_logs`, not `auditLog`.
 */

export interface ProfileSession {
  userId: string;
  sessionId: string;
  sessionToken: string;
  sessionCreatedAt: string;
  sessionUpdatedAt: string;
}

/** Throws 401 unless there is a live session. */
export async function requireProfileSession(headers: Headers): Promise<ProfileSession> {
  const session = await auth.api.getSession({ headers });
  if (!session?.session) throw ApiError.unauthorized();
  return {
    userId: session.user.id,
    sessionId: session.session.id,
    sessionToken: session.session.token,
    sessionCreatedAt: session.session.createdAt.toISOString(),
    sessionUpdatedAt: session.session.updatedAt.toISOString(),
  };
}

// Wire types live in ./types so the client bundle can import them without pulling in Prisma.
export type {
  ProfileActivity, ProfileIdentity, ProfileOrg, ProfileOverview, ProfileSessionView,
  ProfileStat, ProfileStatKey, ProfileSystem, ProfileTab, ActivityDay, ActivityItem,
} from "./types";
export { PROFILE_TABS, parseProfileTab } from "./types";

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

export async function getProfileOverview(profile: ProfileSession): Promise<ProfileOverview> {
  const userId = profile.userId;

  const [user, orgs, systems, credentials, sessionRows] = await Promise.all([
    sharedPrisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, name: true, username: true, email: true, emailVerified: true,
        image: true, coverImage: true, bio: true, phone: true, countryCode: true,
        locale: true, role: true, banned: true, banReason: true, createdAt: true,
        socials: true, profileExtras: true, preferences: true,
        // Only whether a password exists, never the hash itself: this decides
        // whether a clone can be given a usable login for this account at all.
        accounts: { select: { password: true }, take: 1 },
      },
    }),
    sharedPrisma.member.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        role: true,
        createdAt: true,
        organization: {
          select: {
            id: true, name: true, slug: true, logo: true, status: true,
            plan: { select: { code: true, nameAr: true, nameEn: true } },
            _count: { select: { members: true, orgApps: true } },
          },
        },
      },
    }),
    sharedPrisma.organizationApp.findMany({
      where: { organization: { members: { some: { userId } } } },
      orderBy: { installedAt: "desc" },
        select: {
          status: true, version: true, installedAt: true, settings: true,
          organization: { select: { id: true, name: true, slug: true } },
        app: {
          select: {
            id: true, name: true, nameAr: true, slug: true, icon: true, category: true,
            description: true, descriptionAr: true, routePrefix: true, version: true, status: true,
          },
        },
      },
    }),
    // How this member can sign in to each of those copies. Read in the same batch
    // as the systems themselves so the access row on a card can never describe a
    // different install than the card does.
    sharedPrisma.systemCredential.findMany({
      where: { userId },
      select: { organizationId: true, appId: true, username: true, syncedAt: true },
    }),
    // Session rows, not auth.api.listSessions: the Prisma model exposes createdAt
    // and updatedAt, which listSessions omits, and the device list needs them.
    // Expired rows are filtered out — the UI calls these "active sessions", so
    // counting dead sessions would be a lie.
    sharedPrisma.session.findMany({
      where: { userId, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true, token: true, createdAt: true, updatedAt: true, expiresAt: true, ipAddress: true, userAgent: true },
    }),
  ]);

  if (!user) throw ApiError.notFound("User not found");

  const activityTotal = await sharedPrisma.auditLog.count({ where: { actorUserId: userId } });

  const socials = normalizeSocials(user.socials);
  const extras = normalizeExtras(user.profileExtras);
  const preferences = normalizePreferences(user.preferences);
  const country = findCountry(user.countryCode);
  const isPhoneAccount = isInternalAuthEmail(user.email) || !user.email;
  const nameParts = user.name.trim().split(/\s+/).filter(Boolean);

  const identity: ProfileIdentity = {
    id: user.id,
    name: user.name,
    firstName: nameParts[0] ?? "",
    lastName: nameParts.slice(1).join(" "),
    username: user.username,
    handle: user.username ? `@${user.username}` : null,
    email: user.emailVerified ? user.email : user.email,
    emailVerified: user.emailVerified,
    displayIdentifier: displayIdentifier({ email: user.email, phone: user.phone, countryCode: user.countryCode }),
    isPhoneAccount,
    phone: user.phone,
    phoneInternational: formatInternational(user.phone, user.countryCode),
    countryCode: user.countryCode,
    countryNameAr: country?.nameAr ?? null,
    countryNameEn: country ? countryNameEn(country.code) : null,
    image: user.image,
    coverImage: user.coverImage,
    bio: user.bio,
    jobTitle: extras.jobTitle,
    location: extras.location,
    city: extras.city,
    locale: user.locale,
    role: user.role,
    banned: user.banned,
    banReason: user.banReason,
    createdAt: user.createdAt.toISOString(),
    online: Date.now() - new Date(profile.sessionUpdatedAt).getTime() < ONLINE_WINDOW_MS,
    socials,
    extras,
    preferences,
  };

  const organizations: ProfileOrg[] = orgs.map((m) => ({
    id: m.organization.id,
    name: m.organization.name,
    slug: m.organization.slug,
    logo: m.organization.logo,
    status: m.organization.status,
    role: m.role,
    joinedAt: m.createdAt.toISOString(),
    systemCount: m.organization._count.orgApps,
    memberCount: m.organization._count.members,
    planName: m.organization.plan?.nameEn ?? m.organization.plan?.nameAr ?? null,
    planCode: m.organization.plan?.code ?? null,
    isOwner: m.role === "owner",
  }));

  // A social login has no password to copy into a clone, ever — so that state is
  // permanent and the UI must not offer an "activate" action that cannot work.
  const hasPlatformPassword = user.accounts.some((a) => a.password !== null);

  const credentialByInstall = new Map(credentials.map((c) => [`${c.organizationId}:${c.appId}`, c]));

  const systemList: ProfileSystem[] = systems.map((o) => {
    const stored = credentialByInstall.get(`${o.organization.id}:${o.app.id}`);
    const access: ProfileSystemAccess = stored
      ? {
          mode: "password",
          username: stored.username,
          ready: stored.syncedAt !== null,
          syncedAt: stored.syncedAt ? stored.syncedAt.toISOString() : null,
          unavailableReason: null,
        }
      : {
          mode: "gateway",
          username: null,
          ready: false,
          syncedAt: null,
          unavailableReason: hasPlatformPassword ? null : "social_login",
        };
    return {
    id: o.app.id,
    name: o.app.name,
    nameAr: o.app.nameAr,
    // The org's own name for this install, not the catalog's.
    displayName: orgSystemDisplayName(o.settings),
    slug: o.app.slug,
    icon: o.app.icon,
    category: o.app.category,
    description: o.app.description,
    descriptionAr: o.app.descriptionAr,
    routePrefix: o.app.routePrefix,
    // Under the org, not under `/app`: a real system is that org's own copy of a
    // codebase, mounted at `/{org}/{system}`. Demo systems keep their own route.
    route: openRouteForOrgSlug(o.app.slug, o.organization.slug, listSystemSources()),
    version: o.app.version,
    status: o.status,
    organizationId: o.organization.id,
    organizationName: o.organization.name,
    installedAt: o.installedAt.toISOString(),
    access,
    };
  });

  const sessions: ProfileSessionView[] = sessionRows.map((s) => ({
    id: s.id,
    // Token stays on the server; the client only ever sees a boolean.
    current: s.token === profile.sessionToken,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    expiresAt: s.expiresAt.toISOString(),
    ipAddress: s.ipAddress,
    userAgent: s.userAgent,
  }));

  return {
    identity,
    stats: [
      { key: "organizations", value: organizations.length },
      { key: "systems", value: systemList.length },
      { key: "sessions", value: sessions.length },
      { key: "activity", value: activityTotal },
    ],
    organizations,
    systems: systemList,
    sessions,
  };
}

function countryNameEn(code: string): string | null {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? null;
  } catch {
    return null;
  }
}

/* ── activity ────────────────────────────────────────────────────────────── */

const ACTIVITY_WINDOW_DAYS = 364; // 52 weeks
const ACTIVITY_PAGE_SIZE = 20;
const MAX_ACTIVITY_PAGE = 500;

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Per-day activity counts for the last 52 weeks plus a paginated timeline.
 *
 * The heatmap is one grouped SQL query rather than 52 round-trips or a full row
 * fetch, and it is capped to the window. The table is `audit_logs` (snake_case)
 * in the shared schema, so it is both schema-qualified and client-qualified.
 */
export async function getProfileActivity(userId: string, page = 1): Promise<ProfileActivity> {
  const safePage = Math.min(Math.max(1, Math.trunc(page) || 1), MAX_ACTIVITY_PAGE);
  const now = new Date();
  const from = new Date(now.getTime() - ACTIVITY_WINDOW_DAYS * 24 * 3600_000);

  const [rows, total, timeline, timelineCount] = await Promise.all([
    sharedPrisma.$queryRawUnsafe<{ day: string; n: number }[]>(
      `select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day, count(*)::int as n
         from ${dbSchema}.audit_logs
        where actor_user_id = $1 and created_at >= $2
        group by 1`,
      userId,
      from,
    ),
    sharedPrisma.auditLog.count({ where: { actorUserId: userId, createdAt: { gte: from } } }),
    sharedPrisma.auditLog.findMany({
      where: { actorUserId: userId },
      orderBy: { createdAt: "desc" },
      skip: (safePage - 1) * ACTIVITY_PAGE_SIZE,
      take: ACTIVITY_PAGE_SIZE,
      select: {
        id: true, action: true, entityType: true, entityId: true, createdAt: true,
        organization: { select: { name: true } },
      },
    }),
    sharedPrisma.auditLog.count({ where: { actorUserId: userId } }),
  ]);

  const byDay = new Map<string, number>(rows.map((r) => [r.day, r.n]));

  // Always emit the full window so the grid has a stable shape and empty days
  // render as empty cells rather than collapsing the layout.
  const days: ActivityDay[] = [];
  for (let i = ACTIVITY_WINDOW_DAYS; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 3600_000);
    const key = isoDay(d);
    days.push({ date: key, count: byDay.get(key) ?? 0 });
  }

  let maxDay = 0;
  let busiest: ActivityDay | null = null;
  for (const d of days) {
    if (d.count > maxDay) {
      maxDay = d.count;
      busiest = d;
    }
  }
  if (busiest && busiest.count === 0) busiest = null;

  // Streak counts back from today; today not yet having activity does not break it.
  let currentStreak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].count > 0) currentStreak++;
    else if (i !== days.length - 1) break;
  }
  let longestStreak = 0;
  let run = 0;
  for (const d of days) {
    if (d.count > 0) {
      run++;
      if (run > longestStreak) longestStreak = run;
    } else {
      run = 0;
    }
  }

  const items: ActivityItem[] = timeline.map((a) => ({
    id: a.id,
    action: a.action,
    entityType: a.entityType,
    entityId: a.entityId,
    at: a.createdAt.toISOString(),
    organizationName: a.organization?.name ?? null,
  }));

  return {
    days,
    total,
    maxDay,
    currentStreak,
    longestStreak,
    busiest,
    items,
    page: safePage,
    pageSize: ACTIVITY_PAGE_SIZE,
    hasMore: safePage * ACTIVITY_PAGE_SIZE < timelineCount,
  };
}

/* ── mutations ───────────────────────────────────────────────────────────── */

export interface ProfilePatch {
  name?: string;
  username?: string | null;
  bio?: string | null;
  image?: string | null;
  coverImage?: string | null;
  socials?: unknown;
  extras?: unknown;
  preferences?: Partial<Preferences>;
  locale?: "ar" | "en";
}

export class UsernameTakenError extends Error {
  constructor() {
    super("username already taken");
    this.name = "UsernameTakenError";
  }
}

/**
 * The subset of the Prisma client these helpers need. A transaction client and
 * the pooled client are both assignable to it, which is what lets the route
 * pass `tx` and get a genuinely atomic update + audit write.
 */
type ProfileClient = Pick<typeof sharedPrisma, "user" | "session">;

/**
 * Applies a validated profile patch. Only ever called with a userId that came
 * from the session. `socials`/`extras`/`preferences` are normalised here rather
 * than trusted, because they are jsonb.
 *
 * This function is the security boundary, not the route: the route validates for
 * good error messages, but everything is re-checked here so no future caller can
 * bypass it. Pass `db` to run inside the caller's transaction — the audit entry
 * and the user row then commit or roll back together.
 */
export async function updateProfile(
  userId: string,
  patch: ProfilePatch,
  db: ProfileClient = sharedPrisma,
): Promise<{ id: string }> {
  const data: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const name = sanitizeText(patch.name, LIMITS.name);
    if (name === "") throw ApiError.badRequest("Name cannot be empty");
    data.name = name;
  }
  if (patch.bio !== undefined) data.bio = sanitizeMultiline(patch.bio, LIMITS.bio) || null;
  if (patch.image !== undefined) data.image = resolveMediaRef(patch.image, "image");
  if (patch.coverImage !== undefined) data.coverImage = resolveMediaRef(patch.coverImage, "coverImage");
  if (patch.locale !== undefined) data.locale = patch.locale;
  if (patch.socials !== undefined) data.socials = normalizeSocials(patch.socials) as never;
  if (patch.extras !== undefined) data.profileExtras = normalizeExtras(patch.extras) as never;
  if (patch.preferences !== undefined) {
    // Merge with what is stored so a partial update cannot silently reset a flag.
    const current = await db.user.findUnique({ where: { id: userId }, select: { preferences: true } });
    data.preferences = normalizePreferences({ ...normalizePreferences(current?.preferences), ...patch.preferences }) as never;
  }
  if (patch.username !== undefined) {
    if (patch.username === null) {
      data.username = null;
    } else {
      // Re-normalised rather than trusted: callers must not be able to store an
      // upper-case or otherwise invalid handle.
      const result = normalizeUsername(patch.username);
      if (!result.ok) throw ApiError.badRequest("Invalid username", { reason: result.reason });
      const taken = await db.user.findFirst({
        where: { username: result.value, NOT: { id: userId } },
        select: { id: true },
      });
      if (taken) throw new UsernameTakenError();
      data.username = result.value;
    }
  }

  return db.user.update({ where: { id: userId }, data: data as never, select: { id: true } });
}

/**
 * A non-null media reference that fails normalisation is an error, not an
 * instruction to clear the column — otherwise a malformed value silently wipes
 * a working avatar.
 */
function resolveMediaRef(value: string | null, field: string): string | null {
  if (value === null) return null;
  const ref = normalizeMediaRef(value);
  if (ref === null) throw ApiError.badRequest(`Invalid ${field} reference`);
  return ref;
}

/** Session ids belong to the user; anything else is a 404, never a 403 leak. */
export async function assertSessionOwnedBy(userId: string, sessionId: string): Promise<void> {
  const row = await sharedPrisma.session.findFirst({ where: { id: sessionId, userId }, select: { id: true } });
  if (!row) throw ApiError.notFound("Session not found");
}

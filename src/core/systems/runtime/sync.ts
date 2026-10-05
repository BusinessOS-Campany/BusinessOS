import { issueOrgToken } from "./org-token";
import {
  listCredentialsForInstall,
  listCredentialsForUser,
  markCredentialsSynced,
  type StoredCredential,
} from "@/core/systems/credentials";
import { sharedPrisma } from "@/core/db/client";
import { peekOrgRuntime } from "./supervisor";
import { logger } from "@/core/logging/logger";

/**
 * Delivers stored platform passwords into one org's running copy of a system.
 *
 * A clone runs as its own Node process with its own database and its own `users`
 * table, so a digest sitting in the platform's `system_credentials` table is not
 * yet a working login there. This is the hop that makes it one: a loopback POST
 * to the clone's own credentials route, signed with the same gateway token the
 * clone already trusts for the link route.
 *
 * Three callers, three different reasons:
 *
 *  - `syncCredentialsOnBoot` — a cold start, so every member can type a password
 *    on first open instead of waiting for their next visit;
 *  - `syncCredentialsForUser` — a password changed on the platform, which has to
 *    reach every org's copy that member can reach;
 *  - `syncCredentialOnLink` — the per-request fallback, for a clone whose boot
 *    push predates the digest.
 *
 * All of them are best-effort by design. A clone that is not running, does not
 * implement the route, or answers an error leaves that member on gateway access,
 * which is exactly the pre-mirror behaviour — so failures are logged and never
 * thrown into a signup, a password change, or a page render.
 */

/** Path the clone exposes for a batch of digests. */
const CREDENTIALS_PATH = "/api/bos/credentials";

/**
 * Only digests the clone has not acknowledged are worth sending again.
 *
 * The `passwordHash` widening is what makes this a filter rather than a cast: a
 * digest that is already delivered is dropped before it can reach `fetch`.
 */
function pending(
  credentials: readonly (StoredCredential & { passwordHash: string })[],
): (StoredCredential & { passwordHash: string })[] {
  return credentials.filter((c) => !c.synced);
}

export interface CredentialSyncResult {
  /** True when the clone answered the push. */
  synced: boolean;
  updated: number;
  /** Digests already identical in the clone; nothing was written for these. */
  unchanged: number;
  /** Digests for members this clone has no enabled account for yet. */
  missing: number;
  reason?: string;
}

/** Where a running clone is listening, and under which mount point. */
export interface SyncTarget {
  origin: string;
  basePath: string;
}

/**
 * The token a push is signed with.
 *
 * A normal org token, because the thing the clone needs to authorise is "which
 * org is this" — the same claim `link` checks. The digests travel in the body
 * rather than in here: a token is `base64url(json).base64url(hmac)`, which is
 * signed but NOT encrypted, so anything inside one is readable by anything that
 * can see it.
 *
 * `role` is unused here: the credentials route never provisions a user and
 * never reads a role, and the clone maps an unknown role to its least-privileged
 * default if it ever looks.
 */
function pushToken(orgId: string, orgSlug: string): string {
  return issueOrgToken({
    organizationId: orgId,
    organizationSlug: orgSlug,
    userId: "platform-credential-push",
    email: "",
    name: "Platform",
    role: "system",
  });
}

async function push(
  target: SyncTarget,
  token: string,
  credentials: readonly { username: string; passwordHash: string }[],
): Promise<CredentialSyncResult> {
  const response = await fetch(`${target.origin}${target.basePath}${CREDENTIALS_PATH}`, {
    method: "POST",
    headers: { "x-bos-gateway-token": token, "content-type": "application/json" },
    body: JSON.stringify({
      credentials: credentials.map((c) => ({ username: c.username, passwordHash: c.passwordHash })),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    return { synced: false, updated: 0, unchanged: 0, missing: 0, reason: `clone answered ${response.status}` };
  }
  const body = (await response.json().catch(() => null)) as {
    updated?: number;
    unchanged?: number;
    missing?: number;
  } | null;
  return {
    synced: true,
    updated: body?.updated ?? 0,
    unchanged: body?.unchanged ?? 0,
    missing: body?.missing ?? 0,
  };
}

const NOTHING: CredentialSyncResult = { synced: true, updated: 0, unchanged: 0, missing: 0 };

/** The installed app id for one (org, slug) pair, or null when it is not installed. */
async function installedAppId(orgId: string, systemSlug: string): Promise<string | null> {
  const row = await sharedPrisma.organizationApp.findFirst({
    where: { organizationId: orgId, app: { slug: systemSlug }, status: { in: ["installed", "active"] } },
    select: { appId: true },
  });
  return row?.appId ?? null;
}

/**
 * Pushes every stored digest for one (org, app) pair. Called on boot, so a fresh
 * clone is immediately usable by every member who has a mirrored password.
 */
export async function syncCredentialsOnBoot(input: {
  orgId: string;
  orgSlug: string;
  systemSlug: string;
  target: SyncTarget;
}): Promise<CredentialSyncResult> {
  try {
    const appId = await installedAppId(input.orgId, input.systemSlug);
    if (!appId) return { synced: false, updated: 0, unchanged: 0, missing: 0, reason: "not installed" };

    const unsynced = pending(await listCredentialsForInstall(input.orgId, appId));
    // Nothing stored, or everything already acknowledged: no round trip.
    if (unsynced.length === 0) return NOTHING;

    const result = await push(input.target, pushToken(input.orgId, input.orgSlug), unsynced);
    if (result.synced) {
      await markCredentialsSynced(input.orgId, appId, unsynced.map((c) => c.username));
    } else {
      logger.warn(
        { orgSlug: input.orgSlug, systemSlug: input.systemSlug, reason: result.reason },
        "[credentials] boot push did not land",
      );
    }
    return result;
  } catch (err) {
    logger.error({ err, orgSlug: input.orgSlug, systemSlug: input.systemSlug }, "[credentials] boot push failed");
    return { synced: false, updated: 0, unchanged: 0, missing: 0, reason: "push failed" };
  }
}

/**
 * Pushes one member's digest to the clone behind a `/{org}/{system}` request.
 *
 * This closes the window where someone changes their password while no process
 * is running for that org: their next request reaches the system, and the digest
 * travels with it.
 */
export async function syncCredentialOnLink(input: {
  orgId: string;
  orgSlug: string;
  systemSlug: string;
  userId: string;
  target: SyncTarget;
}): Promise<CredentialSyncResult> {
  try {
    const appId = await installedAppId(input.orgId, input.systemSlug);
    if (!appId) return { synced: false, updated: 0, unchanged: 0, missing: 0, reason: "not installed" };

    const mine = pending(await listCredentialsForInstall(input.orgId, appId)).filter(
      (c) => c.userId === input.userId,
    );
    if (mine.length === 0) return NOTHING;

    const result = await push(input.target, pushToken(input.orgId, input.orgSlug), mine);
    if (result.synced) {
      await markCredentialsSynced(input.orgId, appId, mine.map((c) => c.username));
    }
    return result;
  } catch (err) {
    logger.error(
      { err, orgSlug: input.orgSlug, systemSlug: input.systemSlug, userId: input.userId },
      "[credentials] per-user push failed",
    );
    return { synced: false, updated: 0, unchanged: 0, missing: 0, reason: "push failed" };
  }
}

/**
 * Pushes a changed password to every clone that member can reach.
 *
 * Called from the password-change endpoint. Only the pairs that have a RUNNING
 * runtime are pushed: a stopped clone pushes on its next boot (see
 * `syncCredentialsOnBoot`), and starting one here would mean booting a process
 * the member did not ask for just to change a password.
 */
export async function syncCredentialsForUser(
  userId: string,
  resolveTarget: (input: { orgId: string; systemSlug: string }) => SyncTarget | null,
): Promise<number> {
  let pushed = 0;
  try {
    for (const row of await listCredentialsForUser(userId)) {
      const target = resolveTarget({ orgId: row.organizationId, systemSlug: row.appSlug });
      if (!target) continue;

      const result = await push(target, pushToken(row.organizationId, row.organizationSlug), [
        { username: row.username, passwordHash: row.passwordHash },
      ]);
      if (result.synced) {
        await markCredentialsSynced(row.organizationId, row.appId, [row.username]);
        pushed += 1;
      }
    }
  } catch (err) {
    logger.error({ err, userId }, "[credentials] password-change push failed");
  }
  return pushed;
}

/**
 * A resolver for `syncCredentialsForUser` that only reports runtimes that are
 * already up.
 *
 * Deliberately does NOT boot one: changing a password must not start a customer
 * system nobody asked for. A clone that is down takes the new digest on its next
 * boot, which is the same path a fresh install uses.
 */
export function runningRuntimeTarget(input: { orgId: string; systemSlug: string }): SyncTarget | null {
  const runtime = peekOrgRuntime(input.orgId, input.systemSlug);
  if (!runtime) return null;
  return { origin: runtime.origin, basePath: runtime.basePath };
}

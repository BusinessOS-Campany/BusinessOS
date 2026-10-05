import bcrypt from "bcryptjs";
import { sharedPrisma } from "@/core/db/client";
import { logger } from "@/core/logging/logger";

/**
 * One email and one password, on the platform and inside the org's own copy of a
 * system.
 *
 * Each org owns a private copy of a system (`system/<slug>/` cloned into
 * `orginazition/<org>/systems/<slug>/`), running as its own Node process against
 * its own database. That database has its own `users` table with a `passwordHash`
 * column in bcrypt, which the platform cannot read.
 *
 * The platform's own password is a Better Auth **scrypt** digest in
 * `accounts.password`. Two consequences, and both are load-bearing:
 *
 *  - no cloned system can verify a scrypt digest, so handing it the platform hash
 *    would never produce a working login;
 *  - scrypt cannot be converted into bcrypt, so there is no "copy the hash across"
 *    shortcut. The plaintext is the only bridge, and the platform sees it at
 *    exactly two moments: signup and change-password.
 *
 * So at those moments we also write a bcrypt digest of the SAME password into
 * `system_credentials`, keyed per (org, app, user), and push it into the clone's
 * `users` table. `bcryptjs` at cost 12 is used on purpose: it is the same library
 * and the same cost the clone verifies with (`features/auth/service.ts:12`), so
 * one digest works on both sides.
 *
 * What this deliberately does NOT do:
 *
 *  - **Social logins are gateway-only.** A Google or Facebook account has no
 *    password to mirror, so no row is ever written and that member keeps reaching
 *    their systems through the platform proxy. Inventing a password for them
 *    would put a credential in a database that nobody chose.
 *  - **No row means gateway-only**, for everyone. Members who joined before this
 *    shipped, and members whose password predates it, keep using the proxy until
 *    they re-confirm their password once (`confirmCredentialForOrg`).
 *  - **The scrypt hash is never copied here.** `system_credentials` holds a bcrypt
 *    digest and nothing else, so a leak of this table is not a leak of the
 *    platform's credential store.
 */

/** Matches the clone's cost so one digest verifies on both sides. */
const BCRYPT_ROUNDS = 12;

/** Path the clone exposes for the platform to push digests into. */
export const CREDENTIALS_PATH = "/api/bos/credentials";

/** One member's digest, on its way into a clone. */
export interface CredentialPush {
  username: string;
  passwordHash: string;
}

export interface StoredCredential {
  userId: string;
  username: string;
  /** False while the digest is stored but not yet confirmed in the clone. */
  synced: boolean;
  syncedAt: string | null;
}

/**
 * The username a member signs in with inside a clone.
 *
 * The platform's own `@handle` when they chose one, otherwise the account's
 * sign-in identifier (email, or phone for phone accounts). Phone accounts get
 * their phone, which is exactly what they type on the platform too. Stored on the
 * row rather than derived at push time so the profile page can show the member
 * the literal string they must enter, even if they later change their handle.
 */
export function systemUsernameFor(user: {
  username: string | null;
  email: string | null;
  phone: string | null;
}): string {
  const handle = user.username?.trim();
  if (handle) return handle;
  const email = user.email?.trim();
  if (email) return email.toLowerCase();
  const phone = user.phone?.trim();
  if (phone) return phone;
  throw new Error("[system-credentials] user has no username, email or phone to sign in with");
}

/** bcrypt digest of a plaintext password, at the cost the clone expects. */
export async function hashSystemPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

/** True when this account can have a mirrored password at all. */
function canMirror(user: { accounts: { password: string | null }[] }): boolean {
  // A social account has no `credential` account row, so it has no password.
  // Its members keep gateway access; nothing here invents one for them.
  return user.accounts.some((account) => account.password !== null);
}

/**
 * Stores a bcrypt digest of `password` for every (org, app) this user is an
 * active member of.
 *
 * Called at signup and at every password change, which are the only two moments
 * the platform holds the plaintext. Returns the number of rows written so the
 * caller can log it; never throws, because losing a mirror must not fail the
 * signup or the password change that triggered it — the member keeps gateway
 * access, which is the pre-existing behaviour.
 */
export async function storeCredentialsForUser(
  userId: string,
  password: string,
): Promise<number> {
  try {
    const user = await sharedPrisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        phone: true,
        accounts: { select: { password: true }, take: 1 },
      },
    });
    if (!user) return 0;
    if (!canMirror(user)) return 0;

    const username = systemUsernameFor(user);
    // One digest serves every org: the same password, the same cost. Hashing per
    // org would multiply a 12-round bcrypt (deliberately slow) by the org count
    // on the request that creates the account.
    const passwordHash = await hashSystemPassword(password);

    const installs = await sharedPrisma.organizationApp.findMany({
      where: {
        status: { in: ["installed", "active"] },
        organization: { members: { some: { userId } } },
      },
      select: { organizationId: true, appId: true },
    });
    if (installs.length === 0) return 0;

    // `syncedAt` is left null so the next boot or link pushes the digest into a
    // clone that has never seen it. An update also clears it, because a changed
    // digest has NOT been delivered yet — see `markCredentialsSynced`.
    await sharedPrisma.$transaction(
      installs.map((install) =>
        sharedPrisma.systemCredential.upsert({
          where: {
            organizationId_appId_userId: {
              organizationId: install.organizationId,
              appId: install.appId,
              userId,
            },
          },
          create: { organizationId: install.organizationId, appId: install.appId, userId, username, passwordHash },
          update: { username, passwordHash, syncedAt: null },
        }),
      ),
    );
    return installs.length;
  } catch (err) {
    logger.error({ err, userId }, "[system-credentials] storing digests failed");
    return 0;
  }
}

/**
 * Re-confirms an existing member's password so they can sign in directly to a
 * clone, for members who joined before this shipped.
 *
 * The password is verified against the platform's own credential store first, so
 * this can never be used to set a digest the member does not actually hold. Only
 * that one (org, app) pair is written — asking for a system the member is not an
 * active member of returns nothing rather than writing a row.
 */
export async function confirmCredentialForOrg(input: {
  userId: string;
  organizationId: string;
  appId: string;
  currentPassword: string;
}): Promise<{ stored: boolean; username: string | null; reason?: string }> {
  const account = await sharedPrisma.account.findFirst({
    where: { userId: input.userId, providerId: "credential" },
    select: { password: true },
  });
  if (!account?.password) {
    return { stored: false, username: null, reason: "no_password_account" };
  }
  if (!(await bcrypt.compare(input.currentPassword, account.password))) {
    return { stored: false, username: null, reason: "wrong_password" };
  }

  const [user, install] = await Promise.all([
    sharedPrisma.user.findUnique({
      where: { id: input.userId },
      select: { username: true, email: true, phone: true },
    }),
    sharedPrisma.organizationApp.findUnique({
      where: { organizationId_appId: { organizationId: input.organizationId, appId: input.appId } },
      select: { status: true },
    }),
  ]);
  if (!user) return { stored: false, username: null, reason: "user_not_found" };
  if (!install || !["installed", "active"].includes(install.status)) {
    return { stored: false, username: null, reason: "not_installed" };
  }

  const username = systemUsernameFor(user);
  const passwordHash = await hashSystemPassword(input.currentPassword);
  await sharedPrisma.systemCredential.upsert({
    where: {
      organizationId_appId_userId: {
        organizationId: input.organizationId,
        appId: input.appId,
        userId: input.userId,
      },
    },
    create: { organizationId: input.organizationId, appId: input.appId, userId: input.userId, username, passwordHash },
    update: { username, passwordHash, syncedAt: null },
  });
  return { stored: true, username };
}

/** Every stored digest for one (org, app) pair — what a boot pushes. */
export async function listCredentialsForInstall(
  organizationId: string,
  appId: string,
): Promise<(StoredCredential & { passwordHash: string })[]> {
  const rows = await sharedPrisma.systemCredential.findMany({
    where: { organizationId, appId },
    select: { userId: true, username: true, passwordHash: true, syncedAt: true },
  });
  return rows.map((row) => ({
    userId: row.userId,
    username: row.username,
    passwordHash: row.passwordHash,
    synced: row.syncedAt !== null,
    syncedAt: row.syncedAt ? row.syncedAt.toISOString() : null,
  }));
}

/**
 * Every stored digest for one user across every org — what a password change
 * pushes. The org slug and app slug travel with each row because the push needs
 * both to address the clone, and resolving them here keeps the caller from
 * re-querying per row.
 */
export async function listCredentialsForUser(userId: string): Promise<
  {
    organizationId: string;
    organizationSlug: string;
    appId: string;
    appSlug: string;
    username: string;
    passwordHash: string;
  }[]
> {
  const rows = await sharedPrisma.systemCredential.findMany({
    where: { userId },
    select: {
      organizationId: true,
      appId: true,
      username: true,
      passwordHash: true,
      organization: { select: { slug: true } },
      app: { select: { slug: true } },
    },
  });
  return rows.map((row) => ({
    organizationId: row.organizationId,
    organizationSlug: row.organization.slug,
    appId: row.appId,
    appSlug: row.app.slug,
    username: row.username,
    passwordHash: row.passwordHash,
  }));
}

/** Marks digests as delivered to their clone. Only called after the push succeeds. */
export async function markCredentialsSynced(
  organizationId: string,
  appId: string,
  usernames: string[],
): Promise<void> {
  if (usernames.length === 0) return;
  await sharedPrisma.systemCredential.updateMany({
    where: { organizationId, appId, username: { in: usernames } },
    data: { syncedAt: new Date() },
  });
}

/**
 * Drops a member's digests for one org. Called when they leave it, so a former
 * member's password is not left sitting in a database they can no longer reach.
 */
export async function revokeCredentialsForOrgMember(
  organizationId: string,
  userId: string,
): Promise<number> {
  const { count } = await sharedPrisma.systemCredential.deleteMany({
    where: { organizationId, userId },
  });
  return count;
}

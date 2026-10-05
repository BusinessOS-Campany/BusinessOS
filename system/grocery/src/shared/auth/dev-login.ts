import "server-only";
import { randomBytes, scryptSync } from "node:crypto";
import { db } from "@/shared/db";
import { AppError } from "@/shared/core/api-response";
import { logger } from "@/shared/core/logger";
import { recordAudit } from "@/shared/core/audit";

/**
 * A fixed `admin` / `admin` login, for reaching an organization's own copy of
 * this system during development.
 *
 * A real org is served by the platform, which signs its members in through
 * `/api/bos/link` and creates a local account with an unusable password hash.
 * So the org's own login form has nobody to accept: the only rows in `users` are
 * platform-provisioned and cannot be signed into with a password. That is
 * correct for a customer — there is exactly one door and the platform holds it —
 * but it makes the cloned system impossible to exercise on its own, which is
 * what this is for.
 *
 * It is off unless `GROCERY_DEV_LOGIN=1`:
 *
 *  - The platform's supervisor runs every clone with `NODE_ENV=production`, so
 *    `NODE_ENV` cannot be the gate here. An explicit variable is set by whoever
 *    is doing the developing, and defaults to off everywhere else.
 *  - The account it provisions is a normal user, and its password hash is
 *    random and unusable, exactly like a platform-provisioned one. Unsetting the
 *    flag therefore closes this door completely rather than leaving a guessable
 *    password behind — the seeded `demo123` users of `prisma/seed.ts` are the
 *    only accounts with a password anyone knows, and the seed never runs against
 *    a real org's database (`prisma/bootstrap.ts` is what runs there).
 */

/** The one identity and password this accepts. */
export const DEV_IDENTITY = "admin";
export const DEV_PASSWORD = "admin";

/** Set to `1` to accept the fixed development credential. Anything else is off. */
export function devLoginEnabled(): boolean {
  return process.env.GROCERY_DEV_LOGIN === "1";
}

/** True when these credentials are the fixed development pair and the flag is on. */
export function isDevCredential(identity: string, password: string): boolean {
  return devLoginEnabled() && identity.trim().toLowerCase() === DEV_IDENTITY && password === DEV_PASSWORD;
}

/** A hash that no password can match, for an account only this module signs in. */
function unusableHash(): string {
  return `!dev-${scryptSync(randomBytes(32), randomBytes(16), 32).toString("hex")}`;
}

export interface DevLoginMeta {
  ip: string | null;
  userAgent: string | null;
}

/**
 * Signs the development identity in, creating its account on first use.
 *
 * Returns the same shape as a normal successful authentication so the caller
 * cannot tell the two apart. Refuses when the SUPER_ADMIN role is absent: roles
 * come from this system's own `prisma/bootstrap.ts`, and a user without one
 * would sign in to a shell with no permissions rather than fail visibly.
 */
export async function signInDevAdmin(meta: DevLoginMeta): Promise<{ userId: string; username: string }> {
  const role = await db.role.findUnique({ where: { name: "SUPER_ADMIN" }, select: { id: true } });
  if (!role) {
    logger.error("[dev-login] SUPER_ADMIN role missing; run prisma/bootstrap.ts", {});
    throw new AppError("NOT_CONFIGURED", "This system has not been provisioned yet");
  }

  const existing = await db.user.findUnique({
    where: { username: DEV_IDENTITY },
    select: { id: true, status: true, deletedAt: true, roleId: true },
  });

  let userId: string;
  if (existing) {
    if (existing.deletedAt !== null || existing.status === "SUSPENDED") {
      throw new AppError("ACCOUNT_SUSPENDED", "Account suspended / الحساب موقوف");
    }
    userId = existing.id;
    // A stale lock from earlier real attempts must not block the dev door, and
    // an account that once had a role attached keeps whatever it has.
    await db.user.update({
      where: { id: existing.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
  } else {
    userId = (
      await db.user.create({
        data: {
          username: DEV_IDENTITY,
          email: null,
          passwordHash: unusableHash(),
          fullName: "Administrator",
          fullNameAr: "مسؤول النظام",
          roleId: role.id,
          mustChangePassword: false,
        },
        select: { id: true },
      })
    ).id;
    logger.info("[dev-login] development admin account created", { userId });
  }

  await db.loginActivity.create({
    data: { userId, email: DEV_IDENTITY, success: true, reason: "DEV_LOGIN", ip: meta.ip, userAgent: meta.userAgent },
  });
  await recordAudit(db, {
    userId,
    action: "LOGIN",
    entityType: "User",
    entityId: userId,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return { userId, username: DEV_IDENTITY };
}

import { logger } from "@/core/logging/logger";
import { ensureOrgOpened, scaffoldOrgFolder } from "./provision";

/**
 * The single call every tenant-creation path makes.
 *
 * Kept in its own module so the four creation sites (public signup, platform
 * admin, Better Auth organization plugin, social sign-in completion) cannot
 * drift apart, and so the failure policy is decided once.
 *
 * Failure policy: creating a folder must never fail a signup. Everything here
 * is mkdir plus a few small JSON files, and the org's schema is created
 * afterwards by `openOrgVault` when the customer first opens the org. If even
 * this throws, the error is logged and swallowed and the backfill script picks
 * the org up later.
 */

/** Master switch. `ORG_VAULT_ENABLED=0` turns folder creation off entirely. */
export function isOrgVaultEnabled(): boolean {
  return process.env.ORG_VAULT_ENABLED !== "0";
}

/**
 * Called immediately after an organization row is committed.
 *
 * Synchronous part: the folder tree, the registry entry, and the
 * `org.json` / `systems.json` / `members.json` / `manifest.json` / `README.md`
 * / `connection.json` snapshots — so the folder is complete and browsable the
 * moment this returns.
 *
 * The schema and its first `.sql` are NOT created here: that is
 * `openOrgVault`'s job, on the customer's first visit, so signup stays fast.
 */
export async function onOrganizationCreated(org: { id: string; slug: string; name?: string }): Promise<void> {
  if (!isOrgVaultEnabled()) return;
  try {
    await scaffoldOrgFolder(org);
    logger.info({ orgId: org.id, slug: org.slug }, "[org-vault] organization folder created");
  } catch (err) {
    logger.error({ err, orgId: org.id, slug: org.slug }, "[org-vault] folder creation failed");
  }
}

/** Ensures the org's schema exists, loading its `.sql` file when absent. */
export async function onOrganizationOpened(org: { slug: string }): Promise<void> {
  if (!isOrgVaultEnabled()) return;
  await ensureOrgOpened(org.slug);
}

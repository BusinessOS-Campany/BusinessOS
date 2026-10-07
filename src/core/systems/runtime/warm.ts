/**
 * Warming an org's runtime at install time.
 *
 * Installing a system hands the org a folder of source, but nothing is built or
 * started until the first open — a first visit that sits blank for the minutes a
 * production build takes. Warm the runtime when the human approves the request
 * instead, so the customer's first open is already served.
 *
 * This is best-effort and never blocks the approval: a warm failure must not
 * turn a successful install into an error. But it must not be silent either, so
 * a failure is written next to the org's system as `.runtime.error.json` and the
 * install-status endpoint reports `state: "failed"` — the org sees the problem
 * rather than a spinner that never resolves.
 */

import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getEnv } from "@/core/config/env";
import { logger } from "@/core/logging/logger";
import { appendJsonLine, orgVaultPaths } from "@/core/org-vault/paths";
import { getVaultEntry } from "@/core/org-vault/registry";
import { orgSystemDir } from "@/core/org-vault/system-clone";
import { ensureOrgRuntime } from "./supervisor";
import { orgSystemPath } from "./urls";

const BOOT_ERROR_FILE = ".runtime.error.json";

export interface OrgSystemBootError {
  at: string;
  message: string;
}

function bootErrorPath(orgSlug: string, systemSlug: string): string {
  const folder = getVaultEntry(orgSlug)?.folder ?? orgSlug;
  return join(orgSystemDir(orgVaultPaths(folder), systemSlug), BOOT_ERROR_FILE);
}

/** The recorded warm-boot failure for an org's system, if any. */
export function readOrgSystemBootError(orgSlug: string, systemSlug: string): OrgSystemBootError | null {
  const file = bootErrorPath(orgSlug, systemSlug);
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf-8")) as Partial<OrgSystemBootError>;
    if (typeof parsed?.message === "string") {
      return { at: parsed.at ?? new Date().toISOString(), message: parsed.message };
    }
  } catch {
    // A truncated or hand-edited marker still means "this did not boot", so fall
    // through to a generic message instead of pretending everything is fine.
  }
  return { at: new Date().toISOString(), message: "The system failed to start" };
}

function clearOrgSystemBootError(orgSlug: string, systemSlug: string): void {
  try {
    rmSync(bootErrorPath(orgSlug, systemSlug), { force: true });
  } catch {
    // Best-effort: a stale marker only costs a misleading "failed" card that the
    // next successful boot overwrites.
  }
}

/**
 * Fire-and-forget hook so approval can return immediately. Callers must not
 * await this on a request path; the promise settles after the response.
 */
export function warmOrgRuntime(input: {
  orgId: string;
  orgSlug: string;
  systemSlug: string;
}): Promise<void> {
  const basePath = orgSystemPath(input.orgSlug, input.systemSlug);
  // A fresh attempt supersedes any earlier failure marker.
  clearOrgSystemBootError(input.orgSlug, input.systemSlug);

  return ensureOrgRuntime({
    orgId: input.orgId,
    orgSlug: input.orgSlug,
    systemSlug: input.systemSlug,
    basePath,
    gatewaySecret: getEnv().AUTH_SECRET,
  })
    .then((runtime) => {
      clearOrgSystemBootError(input.orgSlug, input.systemSlug);
      logger.info(
        { orgSlug: input.orgSlug, systemSlug: input.systemSlug, port: runtime.port },
        "[runtime] warmed at install",
      );
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      const folder = getVaultEntry(input.orgSlug)?.folder ?? input.orgSlug;
      try {
        writeFileSync(
          bootErrorPath(input.orgSlug, input.systemSlug),
          JSON.stringify({ at: new Date().toISOString(), message }, null, 2),
          "utf-8",
        );
        appendJsonLine(orgVaultPaths(folder).provisioningLog, {
          at: new Date().toISOString(),
          event: "system.runtime_warm_failed",
          systemSlug: input.systemSlug,
          error: message,
        });
      } catch {
        // If even the marker cannot be written there is nowhere left to record
        // it; the logger below is the last word.
      }
      logger.error(
        { err, orgSlug: input.orgSlug, systemSlug: input.systemSlug },
        "[runtime] warm boot failed; the next open will retry",
      );
    });
}
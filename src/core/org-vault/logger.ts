import { existsSync, readFileSync } from "node:fs";
import { currentTenantContext } from "@/core/tenancy/context-store";
import { appendJsonLine, orgVaultPaths } from "./paths";
import { getVaultEntry } from "./registry";

/**
 * Per-organization logs inside the org's own folder.
 *
 * The platform has one global pino log, which is right for the app but means an
 * org's activity is not readable on its own. These writers append JSON lines to
 * `<org folder>/logs/`: `app.log` for tenant request activity, `audit.log` for
 * the business audit trail, plus the cluster/provisioning logs written by the
 * provisioning code.
 *
 * Writes are best-effort and never throw — a disk problem in one org's folder
 * must not fail a request for that org, let alone the whole app.
 */

export type OrgLogStream = "app" | "audit";

function logFile(slug: string, stream: OrgLogStream): string | null {
  const entry = getVaultEntry(slug);
  if (!entry) return null;
  const paths = orgVaultPaths(entry.folder);
  return stream === "audit" ? paths.auditLog : paths.appLog;
}

/** Writes one line to an org's log. Returns false when the org has no folder. */
export function writeOrgLog(slug: string, stream: OrgLogStream, entry: Record<string, unknown>): boolean {
  const file = logFile(slug, stream);
  if (!file) return false;
  appendJsonLine(file, { ts: new Date().toISOString(), level: "info", ...entry });
  return true;
}

/** Logs tenant request activity against the CURRENT tenant's folder. */
export function logOrgRequest(entry: Record<string, unknown>): boolean {
  const slug = currentTenantContext()?.slug;
  if (!slug) return false;
  return writeOrgLog(slug, "app", entry);
}

/** Mirrors an audit entry into the current tenant's `logs/audit.log`. */
export function logOrgAudit(entry: {
  organizationId: string | null | undefined;
  action: string;
  entityType: string;
  entityId?: string | null;
  actorUserId?: string | null;
  before?: unknown;
  after?: unknown;
}): boolean {
  const slug = currentTenantContext()?.slug;
  if (!slug) return false;
  return writeOrgLog(slug, "audit", {
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    actorUserId: entry.actorUserId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });
}

/** Tail an org's log for the CLI. Newest last. */
export function tailOrgLog(slug: string, stream: OrgLogStream, limit = 50): string[] {
  const file = logFile(slug, stream);
  if (!file) return [];
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf-8").split("\n").filter(Boolean).slice(-limit);
}

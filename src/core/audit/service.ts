import type { Prisma } from "@/core/db/generated/prisma/client";
import { logOrgAudit } from "@/core/org-vault/logger";

export interface AuditEntry {
  action: string; // e.g. "product.created", "sale.confirmed"
  entityType: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  actorUserId?: string;
  ip?: string;
  userAgent?: string;
}

/**
 * Append-only audit trail. MUST be called inside the same transaction as the
 * business change it describes (pass the tx client). organizationId is null
 * for platform-realm events. Never throws upward: audit failure aborts the tx
 * by design when used inside $transaction.
 */
export async function writeAuditLog(
  tx: Prisma.TransactionClient,
  tenant: { organizationId?: string | null; userId?: string },
  entry: AuditEntry,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      organizationId: tenant.organizationId ?? null,
      actorUserId: entry.actorUserId ?? tenant.userId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      before: (entry.before ?? undefined) as never,
      after: (entry.after ?? undefined) as never,
      ip: entry.ip ?? null,
      userAgent: entry.userAgent ?? null,
    },
  });

  // Mirror into the org's own `logs/audit.log` so an organization's audit trail
  // is readable inside its vault folder. The database row above stays the source
  // of truth; this is a copy, and a failure to write it must not abort the
  // transaction that is committing the business change.
  try {
    logOrgAudit({
      organizationId: tenant.organizationId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      actorUserId: entry.actorUserId ?? tenant.userId,
      before: entry.before,
      after: entry.after,
    });
  } catch {
    // Never throws (org-vault/logger.ts swallows its own errors); this catch
    // only guards against a future change to that contract.
  }
}

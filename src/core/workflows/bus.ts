import type { Prisma } from "@/core/db/generated/prisma/client";
import type { WorkflowEventType } from "./types";

/**
 * M6: Event bus — transactional outbox pattern.
 * Every business service writes events in the SAME Prisma transaction.
 * The pg-backed worker polls and dispatches.
 */
export interface EmitEventInput {
  organizationId: string;
  eventType: WorkflowEventType;
  /** Unique dedup key per org+eventType+entityId — ensures idempotency. */
  dedupeKey: string;
  entityId?: string;
  payload: Record<string, unknown>;
}

/**
 * Append an outbox event inside an existing transaction.
 * MUST be called within the caller's $transaction block so the event
 * rolls back if the business write rolls back (verifiable goal M6.3).
 */
export async function emitOutboxEvent(
  tx: Prisma.TransactionClient,
  input: EmitEventInput,
): Promise<void> {
  await tx.outboxEvent.upsert({
    where: {
      organizationId_dedupeKey: {
        organizationId: input.organizationId,
        dedupeKey: input.dedupeKey,
      },
    },
    create: {
      organizationId: input.organizationId,
      eventType: input.eventType,
      dedupeKey: input.dedupeKey,
      entityId: input.entityId,
      payload: input.payload as never,
      status: "pending",
      nextRunAt: new Date(),
    },
    update: {
      // If event already exists (idempotent re-emit), just touch timestamp.
      // Don't overwrite payload — first write wins.
    },
  });
}

/** Convenience: build a dedupe key from event type + entity id + org. */
export function buildDedupeKey(
  organizationId: string,
  eventType: WorkflowEventType,
  entityId?: string,
): string {
  return `${organizationId}:${eventType}:${entityId ?? "global"}`;
}

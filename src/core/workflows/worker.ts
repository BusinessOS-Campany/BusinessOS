import type { Prisma, PrismaClient } from "@/core/db/generated/prisma/client";
import { prisma } from "@/core/db/client";
import type { ConditionNode, WorkflowAction } from "./types";
import { evaluateConditions } from "./evaluator";
import { executeAction } from "./actions";

/**
 * M6: pg-backed workflow worker. Polls outbox_events, evaluates matching
 * workflow rules, executes actions, handles retry with exponential backoff,
 * and dead-letters after max attempts.
 *
 * Designed for low-scale (<10k events/day). For higher scale, switch to
 * a dedicated queue (BullMQ, etc.) — but the spec explicitly says pg-backed.
 */

const BATCH_SIZE = 50;
const BASE_BACKOFF_MS = 60_000; // 1 minute

/** Process a batch of pending outbox events. Called by the polling worker. */
export async function processOutboxBatch(
  txHost: Prisma.TransactionClient | PrismaClient = prisma,
): Promise<{ processed: number; failed: number }> {
  const now = new Date();

  // Fetch pending events ready to run (nextRunAt <= now).
  const events = await txHost.outboxEvent.findMany({
    where: {
      status: { in: ["pending", "failed"] },
      attempt: { lt: 5 },
      OR: [
        { nextRunAt: null },
        { nextRunAt: { lte: now } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: BATCH_SIZE,
  });

  let processed = 0;
  let failed = 0;

  for (const event of events) {
    const result = await processOneEvent(txHost, event);
    if (result) processed += 1;
    else failed += 1;
  }

  return { processed, failed };
}

async function processOneEvent(
  txHost: Prisma.TransactionClient | PrismaClient,
  event: {
    id: string;
    organizationId: string;
    eventType: string;
    dedupeKey: string;
    payload: unknown;
    attempt: number;
    maxAttempts: number;
  },
): Promise<boolean> {
  try {
    // Mark as processing.
    await txHost.outboxEvent.update({
      where: { id: event.id },
      data: { status: "processing" },
    });

    // Find matching active rules for this event type.
    const rules = await txHost.workflowRule.findMany({
      where: {
        organizationId: event.organizationId,
        triggerEvent: event.eventType,
        isActive: true,
      },
    });

    const payload = (typeof event.payload === "object" && event.payload !== null
      ? event.payload
      : {}) as Record<string, unknown>;

    let anyActionFailed = false;

    for (const rule of rules) {
      // Evaluate conditions.
      const conditions = rule.conditions as ConditionNode;
      if (!evaluateConditions(conditions, payload)) continue;

      const actions = (Array.isArray(rule.actions) ? rule.actions : []) as unknown as WorkflowAction[];

      for (const action of actions) {
        const execResult = await executeAction(
          txHost,
          event.organizationId,
          rule.id,
          event.id,
          action,
          payload,
        );

        // Log execution.
        await txHost.workflowExecution.create({
          data: {
            organizationId: event.organizationId,
            ruleId: rule.id,
            eventId: event.id,
            status: execResult.status,
            actionType: action.type,
            result: execResult.result as never,
            durationMs: execResult.durationMs,
            attempt: event.attempt + 1,
            lastError: execResult.error,
          },
        });

        if (execResult.status === "failed") anyActionFailed = true;
      }
    }

    if (anyActionFailed) {
      // Re-throw to trigger retry logic in the catch block.
      throw new Error("One or more actions failed");
    }

    // Mark event completed.
    await txHost.outboxEvent.update({
      where: { id: event.id },
      data: {
        status: "completed",
        processedAt: new Date(),
      },
    });

    return true;
  } catch (err) {
    // Retry with exponential backoff.
    const nextAttempt = event.attempt + 1;
    const backoffMs = BASE_BACKOFF_MS * Math.pow(2, event.attempt);

    if (nextAttempt >= event.maxAttempts) {
      // Dead-letter.
      await txHost.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: "dead_lettered",
          attempt: nextAttempt,
          lastError: err instanceof Error ? err.message : "unknown",
        },
      });
    } else {
      await txHost.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: "failed",
          attempt: nextAttempt,
          lastError: err instanceof Error ? err.message : "unknown",
          nextRunAt: new Date(Date.now() + backoffMs),
        },
      });
    }

    return false;
  }
}

/**
 * Start the polling loop. In production, this runs via Next.js instrumentation.
 * For tests, call processOutboxBatch() directly.
 */
let pollTimer: ReturnType<typeof setTimeout> | null = null;

export function startWorker(intervalMs = 5_000): void {
  if (pollTimer) return;
  const poll = async () => {
    try {
      await processOutboxBatch();
    } catch {
      // Swallow — worker must never crash the process.
    }
    pollTimer = setTimeout(poll, intervalMs);
  };
  poll();
}

export function stopWorker(): void {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

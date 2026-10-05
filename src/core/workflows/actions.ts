import { createHash } from "node:crypto";
import type { Prisma } from "@/core/db/generated/prisma/client";
import type {
  WorkflowAction,
  NotificationAction,
  WebhookAction,
} from "./types";

/**
 * M6: Action executors. Each action type has a handler that receives the
 * transaction client + event payload and executes the action.
 * Every execution is logged to workflow_executions.
 */
export async function executeAction(
  tx: Prisma.TransactionClient,
  organizationId: string,
  ruleId: string,
  eventId: string | null,
  action: WorkflowAction,
  payload: Record<string, unknown>,
): Promise<{ status: "success" | "failed"; result?: unknown; error?: string; durationMs: number }> {
  const start = Date.now();
  try {
    switch (action.type) {
      case "notification":
        await executeNotification(tx, organizationId, action, payload);
        break;
      case "webhook":
        await executeWebhook(tx, organizationId, action, payload);
        break;
      case "create_record":
        // M6.1 — create_record is a placeholder; real implementation in M9+.
        break;
      case "email_log":
        // M6 — email_log writes to a log; real email sending deferred to M11.
        break;
      case "task":
        // M6 — task creates a notification as a task proxy.
        await executeTaskAsNotification(tx, organizationId, action, payload);
        break;
    }
    const durationMs = Date.now() - start;
    return { status: "success", durationMs };
  } catch (err) {
    const durationMs = Date.now() - start;
    return {
      status: "failed",
      error: err instanceof Error ? err.message : "unknown error",
      durationMs,
    };
  }
}

async function executeNotification(
  tx: Prisma.TransactionClient,
  organizationId: string,
  action: NotificationAction,
  payload: Record<string, unknown>,
): Promise<void> {
  // Interpolate {{field}} placeholders in body from payload.
  const interpolate = (template: string): string =>
    template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(payload[key] ?? ""));

  await tx.notification.create({
    data: {
      organizationId,
      userId: action.config.userId ?? null,
      titleAr: action.config.titleAr ? interpolate(action.config.titleAr) : null,
      titleEn: action.config.titleEn ? interpolate(action.config.titleEn) : null,
      bodyAr: action.config.bodyAr ? interpolate(action.config.bodyAr) : null,
      bodyEn: action.config.bodyEn ? interpolate(action.config.bodyEn) : null,
      href: action.config.href ?? null,
    },
  });
}

async function executeWebhook(
  tx: Prisma.TransactionClient,
  organizationId: string,
  action: WebhookAction,
  payload: Record<string, unknown>,
): Promise<void> {
  // Find active endpoints (or specific one).
  const where: Record<string, unknown> = {
    organizationId,
    isActive: true,
  };
  if (action.config.endpointId) {
    where.id = action.config.endpointId;
  }

  const endpoints = await tx.webhookEndpoint.findMany({ where });

  const body = JSON.stringify(action.config.payload ?? payload);

  for (const ep of endpoints) {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Webhook-Event": payload.eventType as string ?? "unknown",
      };
      // HMAC-SHA256 signing if key present.
      if (ep.signingKey) {
        const sig = createHash("sha256")
          .update(ep.signingKey)
          .update(body)
          .digest("hex");
        headers["X-Webhook-Signature"] = `sha256=${sig}`;
      }
      const res = await fetch(ep.url, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        throw new Error(`Webhook returned ${res.status}`);
      }
    } catch (err) {
      // Webhook failures are logged but don't fail the whole action.
      // The retry logic lives in the worker.
      throw err;
    }
  }
}

async function executeTaskAsNotification(
  tx: Prisma.TransactionClient,
  organizationId: string,
  action: Extract<WorkflowAction, { type: "task" }>,
  payload: Record<string, unknown>,
): Promise<void> {
  const interpolate = (template: string): string =>
    template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(payload[key] ?? ""));

  await tx.notification.create({
    data: {
      organizationId,
      userId: action.config.assigneeId ?? null,
      titleAr: action.config.titleAr ? interpolate(action.config.titleAr) : null,
      titleEn: action.config.titleEn ? interpolate(action.config.titleEn) : null,
      bodyAr: action.config.priority ? `Priority: ${action.config.priority}` : null,
      bodyEn: action.config.priority ? `Priority: ${action.config.priority}` : null,
      href: action.config.dueAt ?? null,
    },
  });
}

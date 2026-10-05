/**
 * M6: Workflow types — event keys, condition AST, action configs.
 * All types are Zod-validated at API boundaries; service-internal usage is typed.
 */

/** Pre-registered domain event types emitted by business services. */
export const WORKFLOW_EVENT_TYPES = [
  "sale.created",
  "sale.updated",
  "sale.deleted",
  "purchase.created",
  "payment.received",
  "inventory.low",
  "inventory.negative",
  "debt.limit",
  "expense.created",
  "member.joined",
] as const;

export type WorkflowEventType = (typeof WORKFLOW_EVENT_TYPES)[number];

/** Condition AST nodes — safe JSON evaluator, NO eval. */
export type ConditionNode =
  | { field: string; op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "contains"; value: unknown }
  | { logic: "and" | "or"; children: ConditionNode[] };

/** Action types that can be attached to a workflow rule. */
export const WORKFLOW_ACTION_TYPES = [
  "notification",
  "webhook",
  "create_record",
  "email_log",
  "task",
] as const;

export type WorkflowActionType = (typeof WORKFLOW_ACTION_TYPES)[number];

export interface NotificationAction {
  type: "notification";
  config: {
    titleAr?: string;
    titleEn?: string;
    bodyAr?: string;
    bodyEn?: string;
    /** User ID to notify. Null = broadcast to org. */
    userId?: string;
    href?: string;
  };
}

export interface WebhookAction {
  type: "webhook";
  config: {
    /** If set, only deliver to this specific endpoint. Otherwise all active endpoints. */
    endpointId?: string;
    /** Override payload. If null, uses the event payload. */
    payload?: Record<string, unknown>;
  };
}

export interface CreateRecordAction {
  type: "create_record";
  config: {
    entityType: string;
    /** Template for the record fields. Supports {{field}} interpolation from event payload. */
    fields: Record<string, unknown>;
  };
}

export interface EmailLogAction {
  type: "email_log";
  config: {
    to: string;
    subjectAr?: string;
    subjectEn?: string;
    bodyAr?: string;
    bodyEn?: string;
    /** Template interpolation from event payload. */
    template?: string;
  };
}

export interface TaskAction {
  type: "task";
  config: {
    titleAr?: string;
    titleEn?: string;
    /** User ID to assign. Null = unassigned. */
    assigneeId?: string;
    dueAt?: string; // ISO datetime
    priority?: "low" | "medium" | "high";
  };
}

export type WorkflowAction = NotificationAction | WebhookAction | CreateRecordAction | EmailLogAction | TaskAction;

export const OUTBOX_STATUSES = ["pending", "processing", "completed", "failed", "dead_lettered"] as const;
export type OutboxStatus = (typeof OUTBOX_STATUSES)[number];

export const EXECUTION_STATUSES = ["success", "failed", "dead_lettered"] as const;
export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];

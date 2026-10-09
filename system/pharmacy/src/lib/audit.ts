import "server-only";
import { prisma } from "@/lib/prisma";

export type AuditExtra = {
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
};

export async function recordAudit(
  userId: string | null | undefined,
  action: string,
  entity: string,
  entityId: string | null | undefined = null,
  extra: AuditExtra = {}
) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        entity,
        entityId,
        before: extra.before !== undefined ? JSON.parse(JSON.stringify(extra.before)) : null,
        after: extra.after !== undefined ? JSON.parse(JSON.stringify(extra.after)) : null,
        ip: extra.ip,
        userAgent: extra.userAgent,
      },
    });
  } catch (e) {
    console.error("[audit] failed to record", action, entity, e);
  }
}

// Convenience actions used across the app.
export const AUDIT_ACTIONS = {
  LOGIN: "login",
  LOGOUT: "logout",
  PASSWORD_RESET: "password_reset",
  CREATE: "create",
  UPDATE: "update",
  DELETE: "delete",
  VOID: "void",
  RECEIVE: "receive",
  RETURN: "return",
  ADJUST: "adjust",
  TRANSFER: "transfer",
  PAYMENT: "payment",
  DISPENSE: "dispense",
  OPEN_CASH: "open_cash",
  CLOSE_CASH: "close_cash",
} as const;
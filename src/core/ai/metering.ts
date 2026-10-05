import type { PrismaClient } from "@/core/db/generated/prisma/client";
import { ApiError } from "@/core/http/api";

/**
 * Per-plan monthly AI request caps. Platform-defined defaults.
 * Keys match the plan IDs from the plans table.
 */
const PLAN_AI_CAPS: Record<string, number> = {
  free: 50,
  starter: 200,
  professional: 1000,
  enterprise: 10_000,
};

const DEFAULT_CAP = 50;

/**
 * Check if the org has remaining AI requests this month.
 * Throws friendly error if cap exceeded.
 */
export async function assertAiQuota(
  tx: PrismaClient,
  organizationId: string,
  planId: string | null,
) {
  const cap = planId ? (PLAN_AI_CAPS[planId] ?? DEFAULT_CAP) : DEFAULT_CAP;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const count = await tx.aiUsageLog.count({
    where: { organizationId, createdAt: { gte: monthStart } },
  });

  if (count >= cap) {
    throw new ApiError(
      429,
      "AI_QUOTA_EXCEEDED",
      `تم تجاوز الحد الشهري للمساعد الذكي (${cap} طلب)`,
      `Monthly AI quota exceeded (${cap} requests). Please upgrade your plan.`,
      { used: count, limit: cap, planId },
    );
  }

  return { used: count, limit: cap, remaining: cap - count };
}

/**
 * Log an AI usage entry (tokens, cost, tool calls).
 */
export async function logAiUsage(
  tx: PrismaClient,
  data: {
    organizationId: string;
    providerId?: string;
    model: string;
    tokensIn: number;
    tokensOut: number;
    costMicro: number;
    toolCalls: number;
    conversationId?: string;
    createdByUserId?: string;
  },
) {
  return tx.aiUsageLog.create({ data });
}

/**
 * Get usage stats for an org (current month).
 */
export async function getUsageStats(
  tx: PrismaClient,
  organizationId: string,
) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const logs = await tx.aiUsageLog.findMany({
    where: { organizationId, createdAt: { gte: monthStart } },
    select: { tokensIn: true, tokensOut: true, costMicro: true, toolCalls: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  return {
    totalRequests: logs.length,
    totalTokensIn: logs.reduce((s, l) => s + l.tokensIn, 0),
    totalTokensOut: logs.reduce((s, l) => s + l.tokensOut, 0),
    totalCostMicro: logs.reduce((s, l) => s + l.costMicro, 0),
    totalToolCalls: logs.reduce((s, l) => s + l.toolCalls, 0),
    requests: logs,
  };
}

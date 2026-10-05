import type { PrismaClient } from "@/core/db/generated/prisma/client";
import type { TenantRef } from "@/core/sales/service";
import { ApiError } from "@/core/http/api";

const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Create a confirmation token for a pending mutating AI action.
 * The token is single-use and expires after 15 minutes.
 */
export async function createConfirmToken(
  tx: PrismaClient,
  tenant: TenantRef,
  actionType: string,
  actionArgs: Record<string, unknown>,
  toolCallId: string,
) {
  const token = await tx.aiConfirmToken.create({
    data: {
      organizationId: tenant.organizationId,
      actionType,
      actionArgs: actionArgs as never,
      toolCallId,
      createdByUserId: tenant.userId!,
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    },
    select: { id: true, expiresAt: true },
  });
  return { confirmToken: token.id, expiresAt: token.expiresAt };
}

/**
 * Consume a confirmation token. Returns the pending action args.
 * Throws if token is invalid, expired, or already used.
 */
export async function consumeConfirmToken(
  tx: PrismaClient,
  tenant: TenantRef,
  tokenId: string,
) {
  const token = await tx.aiConfirmToken.findFirst({
    where: { id: tokenId, organizationId: tenant.organizationId },
  });
  if (!token) throw ApiError.notFound("Confirmation token not found");
  if (token.used) throw ApiError.badRequest("Confirmation token already used");
  if (token.expiresAt < new Date()) throw ApiError.badRequest("Confirmation token expired");

  // Mark as used atomically
  await tx.aiConfirmToken.update({
    where: { id: tokenId },
    data: { used: true },
  });

  return {
    actionType: token.actionType,
    actionArgs: token.actionArgs as Record<string, unknown>,
    toolCallId: token.toolCallId,
  };
}

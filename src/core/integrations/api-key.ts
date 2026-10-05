import { randomBytes, createHash } from "node:crypto";
import type { PrismaClient } from "@/core/db/generated/prisma/client";
import { ApiError } from "@/core/http/api";
import { writeAuditLog } from "@/core/audit/service";

export interface CreateApiKeyInput {
  name: string;
  scopes: string[];
  expiresAt?: Date | null;
}

export interface ApiKeyResult {
  id: string;
  name: string;
  prefix: string;
  rawKey: string;
  scopes: string[];
  expiresAt: Date | null;
  createdAt: Date;
}

/**
 * Create a scoped API key. The raw key is returned ONCE; only the hash is stored.
 * Format: bos_<32-hex-chars>
 */
export async function createApiKey(
  prisma: PrismaClient,
  tenant: { organizationId: string; userId: string },
  input: CreateApiKeyInput,
): Promise<ApiKeyResult> {
  const rawKey = `bos_${randomBytes(24).toString("hex")}`;
  const keyHash = hashApiKey(rawKey);
  const prefix = rawKey.slice(0, 11);

  const apiKey = await prisma.$transaction(async (tx) => {
    const key = await tx.apiKey.create({
      data: {
        organizationId: tenant.organizationId,
        name: input.name,
        prefix,
        keyHash,
        scopes: input.scopes as never,
        expiresAt: input.expiresAt ?? null,
        createdByUserId: tenant.userId,
      },
    });
    await writeAuditLog(tx, tenant, {
      action: "api_key.created",
      entityType: "apiKey",
      entityId: key.id,
      after: { name: key.name, scopes: input.scopes },
    });
    return key;
  });

  return {
    id: apiKey.id,
    name: apiKey.name,
    prefix,
    rawKey,
    scopes: input.scopes,
    expiresAt: apiKey.expiresAt,
    createdAt: apiKey.createdAt,
  };
}

/** Hash an API key for storage comparison. */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export interface ListApiKeysResult {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  isActive: boolean;
  createdAt: Date;
}

/** List all API keys for an org (never returns the raw key). */
export async function listApiKeys(
  prisma: PrismaClient,
  tenant: { organizationId: string },
): Promise<ListApiKeysResult[]> {
  return prisma.apiKey.findMany({
    where: { organizationId: tenant.organizationId },
    select: {
      id: true,
      name: true,
      prefix: true,
      scopes: true,
      expiresAt: true,
      lastUsedAt: true,
      isActive: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  }) as Promise<ListApiKeysResult[]>;
}

/** Revoke (deactivate) an API key. */
export async function revokeApiKey(
  prisma: PrismaClient,
  tenant: { organizationId: string; userId: string },
  keyId: string,
): Promise<void> {
  const existing = await prisma.apiKey.findFirst({
    where: { id: keyId, organizationId: tenant.organizationId },
  });
  if (!existing) throw ApiError.notFound("API key not found");

  await prisma.$transaction(async (tx) => {
    await tx.apiKey.update({
      where: { id: keyId },
      data: { isActive: false },
    });
    await writeAuditLog(tx, tenant, {
      action: "api_key.revoked",
      entityType: "apiKey",
      entityId: keyId,
      before: { name: existing.name, isActive: true },
      after: { isActive: false },
    });
  });
}

export interface ResolvedApiKey {
  id: string;
  organizationId: string;
  scopes: string[];
}

/**
 * Resolve and validate an API key from a raw key string.
 * Returns the key metadata if valid, null otherwise.
 */
export async function resolveApiKey(
  prisma: PrismaClient,
  rawKey: string,
): Promise<ResolvedApiKey | null> {
  if (!rawKey.startsWith("bos_")) return null;
  const keyHash = hashApiKey(rawKey);

  const key = await prisma.apiKey.findFirst({
    where: { keyHash, isActive: true },
  });
  if (!key) return null;
  if (key.expiresAt && key.expiresAt < new Date()) return null;

  // Update lastUsedAt (fire-and-forget, don't await)
  prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

  return {
    id: key.id,
    organizationId: key.organizationId,
    scopes: (key.scopes as string[]) ?? [],
  };
}

/** Check if a resolved API key has a specific scope. */
export function hasScope(scopes: string[], required: string): boolean {
  if (scopes.includes("*")) return true;
  return scopes.includes(required);
}

/** Enforce that an API key has a specific scope or throw 403. */
export function requireScope(scopes: string[], required: string): void {
  if (!hasScope(scopes, required)) {
    throw ApiError.forbidden(`API key lacks required scope: ${required}`);
  }
}

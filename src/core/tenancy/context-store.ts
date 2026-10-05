import { AsyncLocalStorage } from "node:async_hooks";
import type { PrismaClient } from "@/core/db/generated/prisma/client";

/**
 * Request-scoped tenant context (schema-per-tenant).
 *
 * `withRoute` sets this via `tenantStorage.run(...)` so every `prisma.*` call
 * made by a tenant-scoped handler transparently routes to that tenant's own
 * PostgreSQL schema. Platform-console and background paths run without a
 * store, leaving `prisma` on the shared `businessos` schema.
 */
export interface TenantRuntimeContext {
  organizationId: string;
  slug: string;
  schemaName: string;
  /** Dedicated per-tenant database (null for legacy shared-db tenants). */
  databaseName: string | null;
  prisma: PrismaClient;
}

export const tenantStorage = new AsyncLocalStorage<TenantRuntimeContext>();

export function currentTenantContext(): TenantRuntimeContext | undefined {
  return tenantStorage.getStore();
}

export function runWithTenantContext<R>(ctx: TenantRuntimeContext, fn: () => R): R {
  return tenantStorage.run(ctx, fn);
}
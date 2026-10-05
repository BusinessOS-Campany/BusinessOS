import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";
import { currentTenantContext } from "@/core/tenancy/context-store";

declare global {
  var __bosPrisma: PrismaClient | undefined;
}

/** Schema parsed from DATABASE_URL's `?schema=` — the shared platform schema. */
function schemaFrom(connectionString: string): string {
  return /\bschema=([^&]+)/.exec(connectionString)?.[1] ?? "public";
}

/** Schema the shared platform registry (identity, orgs, apps, audits) lives in. */
export const dbSchema: string = process.env.DATABASE_SCHEMA ?? schemaFrom(process.env.DATABASE_URL ?? "");

function createClient(schema: string): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("[db] DATABASE_URL is not set");
  }
  // pg does not understand Prisma's ?schema= convention — strip it and pass explicitly.
  const pool = new Pool({
    connectionString: connectionString.replace(/\?schema=[^&]*$/, ""),
    options: `-c search_path=${schema}`,
    max: 10,
  });
  const adapter = new PrismaPg(pool, { schema });
  return new PrismaClient({ adapter });
}

/** Prisma client pinned to the shared platform schema (identity, orgs, apps, soft catalog). */
export const sharedPrisma: PrismaClient = globalThis.__bosPrisma ?? createClient(dbSchema);

if (process.env.NODE_ENV !== "production") {
  globalThis.__bosPrisma = sharedPrisma;
}

/**
 * Models that ALWAYS live in the shared platform database. Everything else is
 * tenant-scoped: under an active tenant context (set by `withRoute`) reads and
 * writes route to the tenant's own Prisma client, i.e. the org's isolated
 * schema `t_<slug>` in this same server.
 *
 * This mirrors the compiled runtime whitelist (registry/identity + org apps),
 * extended with the user-profile models (`pinnedApp`, `userFollow`) and the
 * `sama-*` catalog — all post-build additions that still live in the shared
 * schema's 78 tables.
 */
const SHARED_MODELS = new Set([
  "user",
  "session",
  "account",
  "verification",
  "organization",
  "plan",
  "announcement",
  "member",
  "invitation",
  "app",
  "organizationApp",
  "organizationAppRequest",
  "pinnedApp",
  "userFollow",
  "samaAdvance",
  "samaAppointment",
  "samaCalendarEvent",
  "samaCoverage",
  "samaEmployee",
  "samaPatient",
  "samaService",
  "samaSession",
]);

/** Client used for tenant-owned models: the request's tenant client, else shared. */
function modelClient(): PrismaClient {
  return currentTenantContext()?.prisma ?? sharedPrisma;
}

/**
 * Request-aware Prisma router. Shared models (identity, orgs, apps, soft
 * catalog) always hit the shared database; tenant business models follow the
 * AsyncLocalStorage tenant context set by `withRoute`, so `prisma.product`
 * inside an org request transparently lands in that tenant's own schema/db.
 * Platform-console routes and background jobs run with no tenant store and go
 * to the shared `businessos` schema (matching the compiled build exactly).
 */
export const prisma: PrismaClient = new Proxy(sharedPrisma, {
  get(target, prop) {
    if (typeof prop === "string" && SHARED_MODELS.has(prop)) {
      return Reflect.get(target, prop, target);
    }
    const client = modelClient();
    return Reflect.get(client, prop, client);
  },
  has(target, prop) {
    if (typeof prop === "string" && SHARED_MODELS.has(prop)) return prop in target;
    return prop in modelClient();
  },
  set(target, prop, value) {
    if (typeof prop === "string" && SHARED_MODELS.has(prop)) {
      return Reflect.set(target, prop, value, target);
    }
    const client = modelClient();
    return Reflect.set(client, prop, value, client);
  },
});
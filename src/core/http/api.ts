import { NextResponse } from "next/server";
import { requestLogger } from "@/core/logging/logger";
import { getTenantPrisma } from "@/core/tenancy/schemas";
import { resolveTenantSpec } from "@/core/tenancy/context";
import { runWithTenantContext, type TenantRuntimeContext } from "@/core/tenancy/context-store";

/** Machine-readable API error with bilingual user-facing messages. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly messageAr: string,
    public readonly messageEn: string,
    public readonly details?: unknown,
  ) {
    super(messageEn);
    this.name = "ApiError";
  }

  static badRequest(messageEn: string, details?: unknown) {
    return new ApiError(400, "BAD_REQUEST", "طلب غير صالح", messageEn, details);
  }
  static unauthorized(messageEn = "Authentication required") {
    return new ApiError(401, "UNAUTHORIZED", "الوصول غير مصرح به", messageEn);
  }
  static forbidden(messageEn = "Insufficient permissions") {
    return new ApiError(403, "FORBIDDEN", "ليس لديك صلاحية للقيام بهذا الإجراء", messageEn);
  }
  static notFound(messageEn = "Resource not found") {
    return new ApiError(404, "NOT_FOUND", "العنصر غير موجود", messageEn);
  }
  static conflict(messageEn: string, details?: unknown) {
    return new ApiError(409, "CONFLICT", "تعارض في البيانات", messageEn, details);
  }
  static internal(messageEn = "Unexpected server error") {
    return new ApiError(500, "INTERNAL", "حدث خطأ غير متوقع، حاول مجددًا", messageEn);
  }
}

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-XSS-Protection": "0",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
} as const;

type JsonSafe = string | number | boolean | null | JsonSafe[] | { [k: string]: JsonSafe };

/**
 * JSON-safe normalizer: BigInt -> number (when safe) else string;
 * Decimal (toString) and Dates (ISO) handled explicitly.
 */
export function toJsonSafe(value: unknown): JsonSafe {
  if (value === null || value === undefined) return null;
  const t = typeof value;
  if (t === "string" || t === "boolean") return value as string | boolean;
  if (t === "number") return value as number;
  if (typeof BigInt !== "undefined" && t === "bigint") {
    const n = Number(value);
    return Number.isSafeInteger(n) ? n : String(value);
  }
  if (value instanceof Date) return value.toISOString();
  // Prisma Decimal (decimal.js) exposes toFixed — render its exact string.
  if (t === "object" && typeof (value as { toFixed?: unknown }).toFixed === "function") {
    return String(value);
  }
  if (typeof value === "object" && typeof (value as { toHexString?: unknown }).toHexString === "function") {
    return String(value);
  }
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (typeof value === "object") {
    const out: Record<string, JsonSafe> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = toJsonSafe(v);
    }
    return out;
  }
  return String(value);
}

function jsonRes(body: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(body as never, init);
}

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return jsonRes({ data: toJsonSafe(data) }, init);
}

function failEnvelope(err: ApiError, requestId: string): NextResponse {
  return jsonRes(
    {
      error: {
        code: err.code,
        messageAr: err.messageAr,
        messageEn: err.messageEn,
        ...(err.details !== undefined ? { details: toJsonSafe(err.details) } : {}),
        requestId,
      },
    },
    { status: err.status, headers: SECURITY_HEADERS },
  );
}

type RouteHandler<C> = (request: Request, context: C) => Promise<Response>;

/* ── In-memory sliding-window rate limiter (session / user based) ──────── */

interface WindowEntry { count: number; resetAt: number }
const _rateBuckets = new Map<string, WindowEntry>();

/**
 * Sliding-window rate limiter for session-based (non-API-key) routes.
 * Uses an in-memory Map that auto-prunes stale entries. Not suitable for
 * multi-instance deployments — use the PG-backed limiter for those.
 */
export function checkSessionRateLimit(
  identifier: string,
  maxRequests: number,
  windowMs: number,
): { allowed: boolean; remaining: number; resetMs: number } {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const resetAt = windowStart + windowMs;

  let entry = _rateBuckets.get(identifier);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt };
    _rateBuckets.set(identifier, entry);
  }

  entry.count++;
  const remaining = Math.max(0, maxRequests - entry.count);

  // Prune stale entries every 1000 writes (rough heuristic)
  if (_rateBuckets.size > 2000) {
    for (const [k, v] of _rateBuckets) {
      if (v.resetAt <= now) _rateBuckets.delete(k);
    }
  }

  return { allowed: entry.count <= maxRequests, remaining, resetMs: resetAt - now };
}

/**
 * Wraps an API route handler with: request-id propagation, structured logging,
 * security headers, and a guaranteed error envelope. Stack traces never reach
 * the client.
 */
export function withRoute<C = unknown>(name: string, handler: RouteHandler<C>) {
  return async (request: Request, context: C): Promise<Response> => {
    const requestId =
      request.headers.get("x-request-id") ?? globalThis.crypto?.randomUUID() ?? crypto.randomUUID();
    const log = requestLogger(requestId, { route: name, method: request.method });
    const startedAt = Date.now();
    try {
      // Tenant-scope the Prisma client for the handler (subdomain / active org).
      const spec = await resolveTenantSpec(request);
      let response: Response;
      if (spec) {
        const runtime: TenantRuntimeContext = {
          organizationId: spec.organizationId,
          slug: spec.slug,
          schemaName: spec.schemaName,
          databaseName: spec.databaseName,
          prisma: getTenantPrisma(spec.schemaName),
        };
        response = await runWithTenantContext(runtime, () => handler(request, context));
      } else {
        response = await handler(request, context);
      }
      response.headers.set("x-request-id", requestId);
      for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
        if (!response.headers.has(k)) response.headers.set(k, v);
      }
      log.info({ status: response.status, durationMs: Date.now() - startedAt }, "request completed");
      return response;
    } catch (err) {
      const apiError =
        err instanceof ApiError ? err : ApiError.internal(err instanceof Error ? err.message : "unknown");
      if (apiError.status >= 500) {
        log.error({ err, durationMs: Date.now() - startedAt }, "request failed");
      } else {
        log.warn({ code: apiError.code, status: apiError.status, durationMs: Date.now() - startedAt }, "request rejected");
      }
      return failEnvelope(apiError, requestId);
    }
  };
}

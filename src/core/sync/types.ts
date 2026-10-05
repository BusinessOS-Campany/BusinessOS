import { z } from "zod/v4";

// ── Sync operation types ────────────────────────────────────────────────

export const SYNC_OPERATIONS = ["create", "update", "delete"] as const;
export type SyncOperation = (typeof SYNC_OPERATIONS)[number];

export const SYNC_ENTITIES = [
  "product",
  "customer",
  "supplier",
  "category",
  "unit",
  "branch",
  "warehouse",
  "expense",
  "cashAccount",
  "salesInvoice",
  "purchase",
] as const;
export type SyncEntity = (typeof SYNC_ENTITIES)[number];

/** Entity fields that are financial or high-impact → conflict-queued, never LWW. */
export const FINANCIAL_ENTITIES: ReadonlySet<string> = new Set([
  "salesInvoice",
  "purchase",
  "expense",
]);

/** Fields on financial entities that are never auto-resolved. */
export const FINANCIAL_FIELDS: ReadonlySet<string> = new Set([
  "total",
  "subtotal",
  "paidTotal",
  "amount",
  "status",
  "qty",
  "unitPrice",
  "unitCost",
]);

/** Metadata fields safe for LWW auto-resolution. */
export const METADATA_FIELDS: ReadonlySet<string> = new Set([
  "nameAr",
  "nameEn",
  "phone",
  "email",
  "notes",
  "barcode",
  "sku",
  "description",
]);

// ── Zod schemas for API validation ──────────────────────────────────────

export const syncOpSchema = z.object({
  /** Client-generated UUID for the entity. */
  id: z.string().uuid(),
  /** Operation type. */
  op: z.enum(SYNC_OPERATIONS),
  /** Entity type. */
  entity: z.enum(SYNC_ENTITIES),
  /** Idempotency key (client UUID + entity + op). Unique per sync batch. */
  idempotencyKey: z.string().min(1).max(255),
  /** Entity payload (create/update data). */
  payload: z.record(z.string(), z.unknown()).optional(),
  /** Client-side updatedAt for conflict detection. */
  clientTimestamp: z.string().datetime(),
  /** Device fingerprint. */
  deviceFingerprint: z.string().min(1).max(255),
});

export const syncBatchSchema = z.object({
  operations: z.array(syncOpSchema).min(1).max(50),
  deviceFingerprint: z.string().min(1).max(255),
  platform: z.string().max(255).optional(),
});

export type SyncOpInput = z.infer<typeof syncOpSchema>;
export type SyncBatchInput = z.infer<typeof syncBatchSchema>;

// ── Sync result types ───────────────────────────────────────────────────

export interface SyncOpResult {
  id: string;
  op: SyncOperation;
  entity: SyncEntity;
  idempotencyKey: string;
  status: "ok" | "conflict" | "error" | "skipped";
  /** For conflicts: the field and values. */
  conflict?: {
    field: string;
    localValue: unknown;
    remoteValue: unknown;
    localUpdatedAt: string | null;
    remoteUpdatedAt: string | null;
  };
  /** For errors: the message. */
  error?: string;
}

export interface SyncBatchResult {
  processed: SyncOpResult[];
  conflicts: SyncOpResult[];
  errors: SyncOpResult[];
  skipped: SyncOpResult[];
}

// ── Device types ────────────────────────────────────────────────────────

export interface DeviceInfo {
  id: string;
  fingerprint: string;
  platform: string | null;
  lastSyncAt: string | null;
  pendingCount: number;
  isActive: boolean;
  createdAt: string;
}

// ── Conflict resolution types ───────────────────────────────────────────

export const conflictResolutionSchema = z.object({
  conflictId: z.string().uuid(),
  /** "local" = keep client value, "remote" = keep server value */
  resolution: z.enum(["local", "remote"]),
});

export type ConflictResolution = z.infer<typeof conflictResolutionSchema>;

/**
 * M7: Dexie (IndexedDB) schema for offline-first PWA.
 *
 * Mirrors hot entities for offline reads + stores pending writes in an outbox.
 * Every offline-created record gets a client UUID PK + idempotencyKey.
 *
 * NOTE: This file defines the TypeScript types and Dexie table interfaces.
 * The actual Dexie class is instantiated at runtime in the browser (not SSR).
 * Import this file only in client components that run in the browser.
 */

// ── Mirror tables (hot entities cached for offline reads) ──────────────

export interface MirrorProduct {
  id: string;
  organizationId: string;
  sku: string;
  barcode: string | null;
  nameAr: string;
  nameEn: string | null;
  costPrice: number;
  salePrice: number;
  wholesalePrice: number | null;
  taxRateBps: number;
  trackStock: boolean;
  minStock: number | null;
  isActive: boolean;
  /** Server updatedAt timestamp for conflict detection. */
  updatedAt: string;
  /** Local modification flag: true if changed offline since last sync. */
  _dirty: boolean;
}

export interface MirrorCustomer {
  id: string;
  organizationId: string;
  name: string;
  phone: string | null;
  email: string | null;
  creditLimit: number;
  balance: number;
  notes: string | null;
  isActive: boolean;
  updatedAt: string;
  _dirty: boolean;
}

export interface MirrorSupplier {
  id: string;
  organizationId: string;
  name: string;
  phone: string | null;
  balance: number;
  notes: string | null;
  isActive: boolean;
  updatedAt: string;
  _dirty: boolean;
}

export interface MirrorStockLevel {
  id: string;
  organizationId: string;
  productId: string;
  warehouseId: string;
  qty: number;
  updatedAt: string;
  _dirty: boolean;
}

export interface MirrorSettings {
  key: string;
  value: unknown;
  updatedAt: string;
}

// ── Outbox (pending offline writes to sync on reconnect) ───────────────

export type SyncOpType = "create" | "update" | "delete";

export interface OutboxEntry {
  /** Auto-incrementing local ID for ordering. */
  _localId?: number;
  /** Client-generated UUID for the entity. */
  id: string;
  /** Operation type. */
  op: SyncOpType;
  /** Entity type (must match server's SYNC_ENTITIES). */
  entity: string;
  /** Idempotency key: unique per op. */
  idempotencyKey: string;
  /** Entity payload (for create/update). */
  payload?: Record<string, unknown>;
  /** ISO timestamp of when the op was created locally. */
  clientTimestamp: string;
  /** Device fingerprint. */
  deviceFingerprint: string;
  /** Sync status: pending | syncing | failed | synced. */
  syncStatus: "pending" | "syncing" | "failed" | "synced";
  /** Retry count. */
  retryCount: number;
  /** Error message if failed. */
  lastError?: string;
  /** When this entry was created locally. */
  createdAt: string;
}

// ── Sync metadata ──────────────────────────────────────────────────────

export interface SyncState {
  key: string;
  /** ISO timestamp of last successful sync. */
  lastSyncAt: string | null;
  /** Number of pending outbox entries. */
  pendingCount: number;
  /** Whether sync is currently in progress. */
  isSyncing: boolean;
}

// ── Conflict queue (from server, displayed in resolution UI) ───────────

export interface PendingConflict {
  id: string;
  entityType: string;
  entityId: string;
  fieldName: string;
  localValue: unknown;
  remoteValue: unknown;
  localUpdatedAt: string | null;
  remoteUpdatedAt: string | null;
  status: "pending" | "resolved_local" | "resolved_remote";
  resolvedValue?: unknown;
  createdAt: string;
}

// ── Dexie table interface declarations ─────────────────────────────────
// Used when defining the Dexie class. Each method maps to IndexedDB.

export interface BusinessOSDB {
  products: {
    schema: MirrorProduct;
    key: string;
    indexes: {
      "organizationId": string;
      "sku": string;
      "barcode": string;
      "_dirty": boolean;
    };
  };
  customers: {
    schema: MirrorCustomer;
    key: string;
    indexes: {
      "organizationId": string;
      "phone": string;
      "_dirty": boolean;
    };
  };
  suppliers: {
    schema: MirrorSupplier;
    key: string;
    indexes: {
      "organizationId": string;
      "_dirty": boolean;
    };
  };
  stockLevels: {
    schema: MirrorStockLevel;
    key: string;
    indexes: {
      "productId_warehouseId": [string, string];
      "_dirty": boolean;
    };
  };
  settings: {
    schema: MirrorSettings;
    key: string;
  };
  outbox: {
    schema: OutboxEntry;
    key: string;
    indexes: {
      "syncStatus": string;
      "entity": string;
      "createdAt": string;
    };
  };
}

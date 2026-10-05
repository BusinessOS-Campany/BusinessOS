/**
 * M7: Dexie database instance and sync client for browser-side offline-first.
 *
 * This module is client-only (browser). It should NOT be imported in server
 * components or API routes. Use dynamic import with ssr: false.
 *
 * Usage:
 *   import { db, syncClient } from "@/core/sync/client";
 *   await db.products.add({ ... });
 *   await syncClient.enqueue({ op: "create", entity: "product", ... });
 *   await syncClient.syncNow();
 */

import Dexie, { type EntityTable } from "dexie";
import type {
  MirrorProduct,
  MirrorCustomer,
  MirrorSupplier,
  MirrorStockLevel,
  MirrorSettings,
  OutboxEntry,
  SyncOpType,
} from "./types-client";

// ── Dexie schema ───────────────────────────────────────────────────────

class BusinessOSDatabase extends Dexie {
  products!: EntityTable<MirrorProduct, "id">;
  customers!: EntityTable<MirrorCustomer, "id">;
  suppliers!: EntityTable<MirrorSupplier, "id">;
  stockLevels!: EntityTable<MirrorStockLevel, "id">;
  settings!: EntityTable<MirrorSettings, "key">;
  outbox!: EntityTable<OutboxEntry, "_localId">;

  constructor(orgId: string) {
    super(`businessos-${orgId}`);

    this.version(1).stores({
      products: "id, organizationId, sku, barcode, _dirty",
      customers: "id, organizationId, phone, _dirty",
      suppliers: "id, organizationId, _dirty",
      stockLevels: "id, [productId+warehouseId], _dirty",
      settings: "key",
      outbox: "++_localId, id, syncStatus, entity, createdAt",
    });
  }
}

let _db: BusinessOSDatabase | null = null;

/**
 * Get or create the Dexie database for the given org.
 * Call this on app init or on org switch.
 */
export function getDB(orgId: string): BusinessOSDatabase {
  if (!_db || _db.name !== `businessos-${orgId}`) {
    _db = new BusinessOSDatabase(orgId);
  }
  return _db;
}

// ── Sync client ────────────────────────────────────────────────────────

const DEVICE_KEY = "businessos_device_fingerprint";

function getDeviceFingerprint(): string {
  if (typeof window === "undefined") return "server-side";
  let fp = localStorage.getItem(DEVICE_KEY);
  if (!fp) {
    fp = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, fp);
  }
  return fp;
}

function getPlatform(): string {
  if (typeof navigator === "undefined") return "unknown";
  return `${navigator.userAgent}`;
}

export interface EnqueueInput {
  op: SyncOpType;
  entity: string;
  id: string;
  idempotencyKey: string;
  payload?: Record<string, unknown>;
}

export interface SyncClient {
  /** Add an operation to the outbox queue. */
  enqueue(input: EnqueueInput): Promise<void>;
  /** Flush the outbox to the server. */
  syncNow(): Promise<SyncResult>;
  /** Get pending count. */
  pendingCount(): Promise<number>;
  /** Get all pending outbox entries. */
  getPending(): Promise<OutboxEntry[]>;
}

export interface SyncResult {
  processed: number;
  conflicts: number;
  errors: number;
  skipped: number;
}

/**
 * Create a sync client bound to a specific org/user.
 */
export function createSyncClient(
  orgId: string,
  userId: string,
  apiBase = "/api/v1",
): SyncClient {
  const db = getDB(orgId);
  const fingerprint = getDeviceFingerprint();

  return {
    async enqueue(input) {
      const entry: OutboxEntry = {
        id: input.id,
        op: input.op,
        entity: input.entity,
        idempotencyKey: input.idempotencyKey,
        payload: input.payload,
        clientTimestamp: new Date().toISOString(),
        deviceFingerprint: fingerprint,
        syncStatus: "pending",
        retryCount: 0,
        createdAt: new Date().toISOString(),
      };

      await db.outbox.add(entry);
    },

    async syncNow(): Promise<SyncResult> {
      const pending = await db.outbox
        .where("syncStatus")
        .anyOf(["pending", "failed"])
        .sortBy("_localId");

      if (pending.length === 0) {
        return { processed: 0, conflicts: 0, errors: 0, skipped: 0 };
      }

      // Mark as syncing.
      const localIds = pending.map((p) => p._localId!).filter(Boolean);
      await db.outbox.where("_localId").anyOf(localIds).modify({ syncStatus: "syncing" });

      try {
        const res = await fetch(`${apiBase}/sync`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            operations: pending.map((p) => ({
              id: p.id,
              op: p.op,
              entity: p.entity,
              idempotencyKey: p.idempotencyKey,
              payload: p.payload,
              clientTimestamp: p.clientTimestamp,
              deviceFingerprint: p.deviceFingerprint,
            })),
            deviceFingerprint: fingerprint,
            platform: getPlatform(),
          }),
        });

        if (!res.ok) {
          // Mark as failed.
          await db.outbox.where("_localId").anyOf(localIds).modify((entry) => {
            entry.syncStatus = "failed";
            entry.retryCount += 1;
            entry.lastError = `HTTP ${res.status}`;
          });
          return { processed: 0, conflicts: 0, errors: pending.length, skipped: 0 };
        }

        const result = (await res.json()) as { data: { processed: unknown[]; conflicts: unknown[]; errors: unknown[]; skipped: unknown[] } };
        const data = result.data;

        // Remove successfully synced entries.
        await db.outbox.where("_localId").anyOf(localIds).delete();

        return {
          processed: data.processed.length,
          conflicts: data.conflicts.length,
          errors: data.errors.length,
          skipped: data.skipped.length,
        };
      } catch (err) {
        // Network error — mark as failed for retry.
        const errorMsg = err instanceof Error ? err.message : "network error";
        await db.outbox.where("_localId").anyOf(localIds).modify((entry) => {
          entry.syncStatus = "failed";
          entry.retryCount += 1;
          entry.lastError = errorMsg;
        });
        return { processed: 0, conflicts: 0, errors: pending.length, skipped: 0 };
      }
    },

    async pendingCount() {
      return db.outbox.where("syncStatus").equals("pending").count();
    },

    async getPending() {
      return db.outbox.where("syncStatus").equals("pending").toArray();
    },
  };
}

import { hasPermission } from "@/core/db/tenant-guard";
import { modules, type ModuleName, type PermissionStatement } from "@/core/permissions/catalog";
import type { SyncEntity, SyncOperation } from "./types";

/**
 * Per-operation authorization for the offline sync batch endpoint.
 *
 * `/api/v1/sync` accepts an arbitrary mix of create/update/delete operations
 * across eleven entity types in one request. Gating it with a single blanket
 * permission would be wrong in both directions: requiring everything would lock
 * cashers out of POS offline sync, while requiring anything would let a caller
 * with only `products:create` smuggle in an `expense` write.
 *
 * So every operation is checked against the role individually, and one
 * unauthorized operation rejects the whole batch. The batch is all-or-nothing
 * anyway - it is idempotent by `idempotencyKey` and reports per-op results - so
 * failing the request is consistent with how it already behaves.
 */

/** Where each syncable entity lives in the permission catalog. */
const ENTITY_MODULE: Record<SyncEntity, ModuleName> = {
  product: "products",
  customer: "customers",
  supplier: "suppliers",
  // Taxonomy sits with the product catalog: a role that cannot edit products
  // should not be able to invent categories for them.
  category: "products",
  unit: "products",
  // Org structure and money are administrative, so they need `manage` and are
  // deliberately not reachable by a purely operational role.
  branch: "settings",
  warehouse: "inventory",
  expense: "expenses",
  cashAccount: "finance",
  salesInvoice: "sales",
  purchase: "purchases",
};

/**
 * The action that authorizes a write, per module.
 *
 * The obvious `op` -> same-named-verb mapping is wrong for three of these
 * modules, which have no `create`/`update`/`delete` verbs at all:
 *
 *  - `inventory` exposes `adjust`/`transfer`/`count`, so writing a stock level
 *    is an adjustment whether it creates, edits or zeroes the row;
 *  - `finance` and `settings` expose only `manage`.
 *
 * `satisfies` is load-bearing: it makes this table a compile error if a module's
 * actions are ever renamed, rather than silently denying (or granting) access.
 */
const MODULE_WRITE_VERB = {
  products: { create: "create", update: "update", delete: "delete" },
  customers: { create: "create", update: "update", delete: "delete" },
  suppliers: { create: "create", update: "update", delete: "delete" },
  expenses: { create: "create", update: "update", delete: "delete" },
  sales: { create: "create", update: "update", delete: "delete" },
  purchases: { create: "create", update: "update", delete: "delete" },
  inventory: { create: "adjust", update: "adjust", delete: "adjust" },
  finance: { create: "manage", update: "manage", delete: "manage" },
  settings: { create: "manage", update: "manage", delete: "manage" },
} satisfies {
  [K in ModuleName]?: Record<SyncOperation, (typeof modules)[K][number]>;
};

/**
 * Returns the first operation the role is not allowed to perform, or null when
 * the whole batch is permitted.
 *
 * Returned rather than thrown so the caller can report which operation failed;
 * `isSyncBatchAllowed` is the boolean form for tests.
 */
export function findUnauthorizedSyncOp(
  role: string,
  ops: readonly { entity: SyncEntity; op: SyncOperation }[],
): { entity: SyncEntity; op: SyncOperation; module: string } | null {
  for (const entry of ops) {
    // Not named `module`: that shadows CommonJS' `module` and trips
    // @next/next/no-assign-module-variable.
    const moduleName = ENTITY_MODULE[entry.entity];
    const verbs = MODULE_WRITE_VERB[moduleName as keyof typeof MODULE_WRITE_VERB];
    if (!verbs) continue; // unknown entity: validated by the zod schema upstream
    const statement = {
      [moduleName]: [verbs[entry.op]],
    } as unknown as PermissionStatement;
    if (!hasPermission(role, statement)) {
      return { entity: entry.entity, op: entry.op, module: moduleName };
    }
  }
  return null;
}

export function isSyncBatchAllowed(
  role: string,
  ops: readonly { entity: SyncEntity; op: SyncOperation }[],
): boolean {
  return findUnauthorizedSyncOp(role, ops) === null;
}

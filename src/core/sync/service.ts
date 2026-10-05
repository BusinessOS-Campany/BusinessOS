import { Prisma, type PrismaClient } from "@/core/db/generated/prisma/client";
import { ApiError } from "@/core/http/api";
import type {
  SyncBatchInput,
  SyncOpInput,
  SyncBatchResult,
  SyncOpResult,
  ConflictResolution,
} from "./types";
import {
  FINANCIAL_ENTITIES,
  FINANCIAL_FIELDS,
} from "./types";

/**
 * M7: Core sync service. Processes batched offline operations on the server.
 *
 * Flow per op:
 * 1. Check idempotency key → if exists, return cached result (skip).
 * 2. Execute entity-specific handler (create/update/delete).
 * 3. Detect conflicts via updatedAt comparison.
 * 4. Record idempotency key + result.
 * 5. Update device registry.
 */
export async function processSyncBatch(
  prisma: PrismaClient,
  organizationId: string,
  userId: string,
  batch: SyncBatchInput,
): Promise<SyncBatchResult> {
  const result: SyncBatchResult = {
    processed: [],
    conflicts: [],
    errors: [],
    skipped: [],
  };

  await prisma.$transaction(async (tx) => {
    for (const op of batch.operations) {
      const opResult = await processOneOp(tx, organizationId, userId, op);
      switch (opResult.status) {
        case "ok":
          result.processed.push(opResult);
          break;
        case "conflict":
          result.conflicts.push(opResult);
          break;
        case "error":
          result.errors.push(opResult);
          break;
        case "skipped":
          result.skipped.push(opResult);
          break;
      }
    }

    // Update device registry.
    const successCount = result.processed.filter((r) => r.status === "ok").length;
    await tx.syncDevice.upsert({
      where: {
        organizationId_userId_fingerprint: {
          organizationId,
          userId,
          fingerprint: batch.deviceFingerprint,
        },
      },
      create: {
        organizationId,
        userId,
        fingerprint: batch.deviceFingerprint,
        platform: batch.platform ?? null,
        lastSyncAt: new Date(),
        pendingCount: 0,
      },
      update: {
        lastSyncAt: new Date(),
        pendingCount: { decrement: successCount },
        platform: batch.platform ?? undefined,
        isActive: true,
      },
    });
  });

  return result;
}

async function processOneOp(
  tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
  organizationId: string,
  userId: string,
  op: SyncOpInput,
): Promise<SyncOpResult> {
  const base = {
    id: op.id,
    op: op.op,
    entity: op.entity,
    idempotencyKey: op.idempotencyKey,
  };

  // 1. Idempotency check.
  const existing = await tx.idempotencyKey.findUnique({
    where: {
      organizationId_key: {
        organizationId,
        key: op.idempotencyKey,
      },
    },
  });

  if (existing) {
    return { ...base, status: "skipped" };
  }

  try {
    const handler = HANDLERS[op.entity];
    if (!handler) {
      return { ...base, status: "error", error: `Unknown entity: ${op.entity}` };
    }

    const opResult = await handler(tx, organizationId, userId, op);

    // Record idempotency.
    const statusToCode: Record<string, number> = {
      ok: 200,
      conflict: 409,
      error: 500,
    };
    await tx.idempotencyKey.create({
      data: {
        organizationId,
        key: op.idempotencyKey,
        statusCode: statusToCode[opResult.status] ?? 500,
        result: opResult as unknown as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return opResult;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    const opResult: SyncOpResult = { ...base, status: "error", error: msg };

    await tx.idempotencyKey.create({
      data: {
        organizationId,
        key: op.idempotencyKey,
        statusCode: 500,
        result: opResult as unknown as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return opResult;
  }
}

// ── Entity handlers ────────────────────────────────────────────────────

type Handler = (
  tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
  organizationId: string,
  userId: string,
  op: SyncOpInput,
) => Promise<SyncOpResult>;

const HANDLERS: Record<string, Handler> = {
  product: productHandler,
  customer: customerHandler,
  supplier: supplierHandler,
  salesInvoice: salesInvoiceHandler,
  category: categoryHandler,
  unit: unitHandler,
  branch: branchHandler,
  warehouse: warehouseHandler,
  expense: expenseHandler,
  cashAccount: cashAccountHandler,
  purchase: purchaseHandler,
};

function baseResult(op: SyncOpInput): Pick<SyncOpResult, "id" | "op" | "entity" | "idempotencyKey"> {
  return { id: op.id, op: op.op, entity: op.entity, idempotencyKey: op.idempotencyKey };
}

// ── Product handler ────────────────────────────────────────────────────

async function productHandler(
  tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
  organizationId: string,
  userId: string,
  op: SyncOpInput,
): Promise<SyncOpResult> {
  const b = baseResult(op);
  const payload = op.payload ?? {};

  if (op.op === "create") {
    await tx.product.create({
      data: {
        id: op.id,
        organizationId,
        sku: String(payload.sku ?? `SYNC-${op.id.slice(0, 8)}`),
        barcode: (payload.barcode as string) ?? null,
        nameAr: String(payload.nameAr ?? ""),
        nameEn: (payload.nameEn as string) ?? null,
        costPrice: BigInt(Number(payload.costPrice ?? 0)),
        salePrice: BigInt(Number(payload.salePrice ?? 0)),
        wholesalePrice: payload.wholesalePrice != null ? BigInt(Number(payload.wholesalePrice)) : null,
        taxRateBps: Number(payload.taxRateBps ?? 0),
        trackStock: Boolean(payload.trackStock ?? true),
        minStock: payload.minStock != null ? Number(payload.minStock) : null,
        categoryId: (payload.categoryId as string) ?? null,
        baseUnitId: (payload.baseUnitId as string) ?? null,
      },
    });
    return { ...b, status: "ok" };
  }

  if (op.op === "update") {
    return await handleUpdateEntity(tx, organizationId, op, b, "product");
  }

  // delete
  await tx.product.delete({ where: { id: op.id } });
  return { ...b, status: "ok" };
}

// ── Customer handler ───────────────────────────────────────────────────

async function customerHandler(
  tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
  organizationId: string,
  _userId: string,
  op: SyncOpInput,
): Promise<SyncOpResult> {
  const b = baseResult(op);
  const payload = op.payload ?? {};

  if (op.op === "create") {
    await tx.customer.create({
      data: {
        id: op.id,
        organizationId,
        name: String(payload.name ?? ""),
        phone: (payload.phone as string) ?? null,
        email: (payload.email as string) ?? null,
        creditLimit: BigInt(Number(payload.creditLimit ?? 0)),
        notes: (payload.notes as string) ?? null,
      },
    });
    return { ...b, status: "ok" };
  }

  if (op.op === "update") {
    return await handleUpdateEntity(tx, organizationId, op, b, "customer");
  }

  await tx.customer.delete({ where: { id: op.id } });
  return { ...b, status: "ok" };
}

// ── Supplier handler ───────────────────────────────────────────────────

async function supplierHandler(
  tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
  organizationId: string,
  _userId: string,
  op: SyncOpInput,
): Promise<SyncOpResult> {
  const b = baseResult(op);
  const payload = op.payload ?? {};

  if (op.op === "create") {
    await tx.supplier.create({
      data: {
        id: op.id,
        organizationId,
        name: String(payload.name ?? ""),
        phone: (payload.phone as string) ?? null,
        notes: (payload.notes as string) ?? null,
      },
    });
    return { ...b, status: "ok" };
  }

  if (op.op === "update") {
    return await handleUpdateEntity(tx, organizationId, op, b, "supplier");
  }

  await tx.supplier.delete({ where: { id: op.id } });
  return { ...b, status: "ok" };
}

// ── Simple CRUD entities (category, unit, branch, warehouse) ───────────

async function categoryHandler(
  tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
  organizationId: string,
  _userId: string,
  op: SyncOpInput,
): Promise<SyncOpResult> {
  const b = baseResult(op);
  const payload = op.payload ?? {};

  if (op.op === "create") {
    await tx.category.create({
      data: {
        id: op.id,
        organizationId,
        nameAr: String(payload.nameAr ?? ""),
        nameEn: (payload.nameEn as string) ?? null,
        sortOrder: Number(payload.sortOrder ?? 0),
        parentId: (payload.parentId as string) ?? null,
      },
    });
    return { ...b, status: "ok" };
  }

  if (op.op === "update") {
    return await handleUpdateEntity(tx, organizationId, op, b, "category");
  }

  await tx.category.delete({ where: { id: op.id } });
  return { ...b, status: "ok" };
}

async function unitHandler(
  tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
  organizationId: string,
  _userId: string,
  op: SyncOpInput,
): Promise<SyncOpResult> {
  const b = baseResult(op);
  const payload = op.payload ?? {};

  if (op.op === "create") {
    await tx.unit.create({
      data: {
        id: op.id,
        organizationId,
        nameAr: String(payload.nameAr ?? ""),
        nameEn: (payload.nameEn as string) ?? null,
        shortAr: (payload.shortAr as string) ?? null,
        shortEn: (payload.shortEn as string) ?? null,
        factor: Number(payload.factor ?? 1),
        isBase: Boolean(payload.isBase ?? false),
      },
    });
    return { ...b, status: "ok" };
  }

  if (op.op === "update") {
    return await handleUpdateEntity(tx, organizationId, op, b, "unit");
  }

  await tx.unit.delete({ where: { id: op.id } });
  return { ...b, status: "ok" };
}

async function branchHandler(
  tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
  organizationId: string,
  _userId: string,
  op: SyncOpInput,
): Promise<SyncOpResult> {
  const b = baseResult(op);
  const payload = op.payload ?? {};

  if (op.op === "create") {
    await tx.branch.create({
      data: {
        id: op.id,
        organizationId,
        nameAr: String(payload.nameAr ?? ""),
        nameEn: (payload.nameEn as string) ?? null,
        phone: (payload.phone as string) ?? null,
        address: (payload.address as string) ?? null,
      },
    });
    return { ...b, status: "ok" };
  }

  if (op.op === "update") {
    return await handleUpdateEntity(tx, organizationId, op, b, "branch");
  }

  await tx.branch.delete({ where: { id: op.id } });
  return { ...b, status: "ok" };
}

async function warehouseHandler(
  tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
  organizationId: string,
  _userId: string,
  op: SyncOpInput,
): Promise<SyncOpResult> {
  const b = baseResult(op);
  const payload = op.payload ?? {};

  if (op.op === "create") {
    await tx.warehouse.create({
      data: {
        id: op.id,
        organizationId,
        nameAr: String(payload.nameAr ?? ""),
        nameEn: (payload.nameEn as string) ?? null,
      },
    });
    return { ...b, status: "ok" };
  }

  if (op.op === "update") {
    return await handleUpdateEntity(tx, organizationId, op, b, "warehouse");
  }

  await tx.warehouse.delete({ where: { id: op.id } });
  return { ...b, status: "ok" };
}

async function expenseHandler(
  tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
  organizationId: string,
  userId: string,
  op: SyncOpInput,
): Promise<SyncOpResult> {
  const b = baseResult(op);
  const payload = op.payload ?? {};

  if (op.op === "create") {
    await tx.expense.create({
      data: {
        id: op.id,
        organizationId,
        amount: BigInt(Number(payload.amount ?? 0)),
        categoryId: (payload.categoryId as string) ?? null,
        cashAccountId: (payload.cashAccountId as string) ?? null,
        note: (payload.note as string) ?? null,
        spentAt: new Date(String(payload.spentAt ?? new Date().toISOString())),
        createdByUserId: userId,
      },
    });
    return { ...b, status: "ok" };
  }

  if (op.op === "update") {
    return await handleUpdateEntity(tx, organizationId, op, b, "expense");
  }

  await tx.expense.delete({ where: { id: op.id } });
  return { ...b, status: "ok" };
}

async function cashAccountHandler(
  tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
  organizationId: string,
  _userId: string,
  op: SyncOpInput,
): Promise<SyncOpResult> {
  const b = baseResult(op);
  const payload = op.payload ?? {};

  if (op.op === "create") {
    await tx.cashAccount.create({
      data: {
        id: op.id,
        organizationId,
        nameAr: String(payload.nameAr ?? ""),
        nameEn: (payload.nameEn as string) ?? null,
        type: String(payload.type ?? "cash"),
        openingBalance: BigInt(Number(payload.openingBalance ?? 0)),
      },
    });
    return { ...b, status: "ok" };
  }

  if (op.op === "update") {
    return await handleUpdateEntity(tx, organizationId, op, b, "cashAccount");
  }

  await tx.cashAccount.delete({ where: { id: op.id } });
  return { ...b, status: "ok" };
}

// ── Sales invoice handler (financial entity → conflict queue) ──────────

async function salesInvoiceHandler(
  tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
  organizationId: string,
  _userId: string,
  op: SyncOpInput,
): Promise<SyncOpResult> {
  const b = baseResult(op);
  const payload = op.payload ?? {};

  // All sales invoice sync ops go to conflict queue for admin review
  // since they require the full M4 atomic service and are financial.
  await tx.conflictQueue.create({
    data: {
      organizationId,
      entityType: "salesInvoice",
      entityId: op.id,
      fieldName: `_sync_${op.op}`,
      localValue: payload as unknown as Prisma.InputJsonValue,
      remoteValue: Prisma.JsonNull,
      localUpdatedAt: new Date(op.clientTimestamp),
      remoteUpdatedAt: null,
      status: "pending",
    },
  });

  return {
    ...b,
    status: "conflict",
    conflict: {
      field: `_sync_${op.op}`,
      localValue: payload,
      remoteValue: null,
      localUpdatedAt: op.clientTimestamp,
      remoteUpdatedAt: null,
    },
  };
}

// ── Purchase handler (financial → conflict queue for updates) ──────────

async function purchaseHandler(
  tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
  organizationId: string,
  _userId: string,
  op: SyncOpInput,
): Promise<SyncOpResult> {
  const b = baseResult(op);

  // All purchase ops from sync go to conflict queue for admin review.
  await tx.conflictQueue.create({
    data: {
      organizationId,
      entityType: "purchase",
      entityId: op.id,
      fieldName: `_sync_${op.op}`,
      localValue: (op.payload ?? {}) as unknown as Prisma.InputJsonValue,
      remoteValue: Prisma.JsonNull,
      localUpdatedAt: new Date(op.clientTimestamp),
      remoteUpdatedAt: null,
      status: "pending",
    },
  });

  return {
    ...b,
    status: "conflict",
    conflict: {
      field: `_sync_${op.op}`,
      localValue: op.payload ?? null,
      remoteValue: null,
      localUpdatedAt: op.clientTimestamp,
      remoteUpdatedAt: null,
    },
  };
}

// ── Generic update with conflict detection ─────────────────────────────

async function handleUpdateEntity(
  tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
  organizationId: string,
  op: SyncOpInput,
  b: Pick<SyncOpResult, "id" | "op" | "entity" | "idempotencyKey">,
  entity: string,
): Promise<SyncOpResult> {
  const payload = op.payload ?? {};

  // Fetch current server version.
  const getModel = () => {
    switch (entity) {
      case "product": return tx.product.findUnique({ where: { id: op.id } });
      case "customer": return tx.customer.findUnique({ where: { id: op.id } });
      case "supplier": return tx.supplier.findUnique({ where: { id: op.id } });
      case "category": return tx.category.findUnique({ where: { id: op.id } });
      case "unit": return tx.unit.findUnique({ where: { id: op.id } });
      case "branch": return tx.branch.findUnique({ where: { id: op.id } });
      case "warehouse": return tx.warehouse.findUnique({ where: { id: op.id } });
      case "expense": return tx.expense.findUnique({ where: { id: op.id } });
      case "cashAccount": return tx.cashAccount.findUnique({ where: { id: op.id } });
      default: return null;
    }
  };

  const current = await getModel();
  if (!current) {
    return { ...b, status: "error", error: "Entity not found" };
  }

  const serverTimestamp = (current as Record<string, unknown>).updatedAt as Date | null;
  const clientTimestamp = new Date(op.clientTimestamp);

  // Conflict detection.
  if (serverTimestamp && clientTimestamp < serverTimestamp) {
    const conflictField = detectConflictField(payload, current as Record<string, unknown>);

    if (conflictField) {
      if (FINANCIAL_ENTITIES.has(entity) || FINANCIAL_FIELDS.has(conflictField)) {
        await tx.conflictQueue.create({
          data: {
            organizationId,
            entityType: entity,
            entityId: op.id,
            fieldName: conflictField,
            localValue: (payload[conflictField] ?? null) as unknown as Prisma.InputJsonValue,
            remoteValue: ((current as Record<string, unknown>)[conflictField] ?? null) as unknown as Prisma.InputJsonValue,
            localUpdatedAt: clientTimestamp,
            remoteUpdatedAt: serverTimestamp,
            status: "pending",
          },
        });

        return {
          ...b,
          status: "conflict",
          conflict: {
            field: conflictField,
            localValue: payload[conflictField] ?? null,
            remoteValue: (current as Record<string, unknown>)[conflictField] ?? null,
            localUpdatedAt: op.clientTimestamp,
            remoteUpdatedAt: serverTimestamp?.toISOString() ?? null,
          },
        };
      }
    }
  }

  // No conflict or metadata-only → LWW apply.
  const updateData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (key === "id" || key === "createdAt" || key === "updatedAt") continue;
    updateData[key] = value;
  }

  switch (entity) {
    case "product":
      await tx.product.update({
        where: { id: op.id },
        data: updateData as never,
      });
      break;
    case "customer":
      await tx.customer.update({
        where: { id: op.id },
        data: updateData as never,
      });
      break;
    case "supplier":
      await tx.supplier.update({
        where: { id: op.id },
        data: updateData as never,
      });
      break;
    case "category":
      await tx.category.update({ where: { id: op.id }, data: updateData as never });
      break;
    case "unit":
      await tx.unit.update({ where: { id: op.id }, data: updateData as never });
      break;
    case "branch":
      await tx.branch.update({ where: { id: op.id }, data: updateData as never });
      break;
    case "warehouse":
      await tx.warehouse.update({ where: { id: op.id }, data: updateData as never });
      break;
    case "expense":
      await tx.expense.update({ where: { id: op.id }, data: updateData as never });
      break;
    case "cashAccount":
      await tx.cashAccount.update({ where: { id: op.id }, data: updateData as never });
      break;
  }

  return { ...b, status: "ok" };
}

function detectConflictField(
  payload: Record<string, unknown>,
  serverRow: Record<string, unknown>,
): string | null {
  for (const [field, clientValue] of Object.entries(payload)) {
    if (field === "id" || field === "createdAt" || field === "updatedAt") continue;
    if (clientValue === undefined) continue;

    const serverValue = serverRow[field];
    if (String(clientValue) === String(serverValue)) continue;
    return field;
  }
  return null;
}

// ── Conflict resolution ────────────────────────────────────────────────

export async function resolveConflict(
  prisma: PrismaClient,
  organizationId: string,
  userId: string,
  resolution: ConflictResolution,
): Promise<void> {
  const conflict = await prisma.conflictQueue.findUnique({
    where: { id: resolution.conflictId },
  });

  if (!conflict || conflict.organizationId !== organizationId) {
    throw new ApiError(404, "NOT_FOUND", "العنصر غير موجود", "Conflict not found");
  }

  if (conflict.status !== "pending") {
    throw new ApiError(409, "CONFLICT", "تم حسم التعارض بالفعل", "Conflict already resolved");
  }

  const winningValue =
    resolution.resolution === "local" ? conflict.localValue : conflict.remoteValue;

  // Apply winning value to the entity using Prisma typed API.
  const field = conflict.fieldName;
  const updateData = { [field]: winningValue } as never;

  switch (conflict.entityType) {
    case "product":
      await prisma.product.update({ where: { id: conflict.entityId }, data: updateData });
      break;
    case "customer":
      await prisma.customer.update({ where: { id: conflict.entityId }, data: updateData });
      break;
    case "supplier":
      await prisma.supplier.update({ where: { id: conflict.entityId }, data: updateData });
      break;
    case "category":
      await prisma.category.update({ where: { id: conflict.entityId }, data: updateData });
      break;
    case "unit":
      await prisma.unit.update({ where: { id: conflict.entityId }, data: updateData });
      break;
    case "branch":
      await prisma.branch.update({ where: { id: conflict.entityId }, data: updateData });
      break;
    case "warehouse":
      await prisma.warehouse.update({ where: { id: conflict.entityId }, data: updateData });
      break;
    case "expense":
      await prisma.expense.update({ where: { id: conflict.entityId }, data: updateData });
      break;
    case "cashAccount":
      await prisma.cashAccount.update({ where: { id: conflict.entityId }, data: updateData });
      break;
    default:
      throw new ApiError(400, "BAD_REQUEST", "نوع الكيان غير مدعوم", `Cannot resolve conflicts for entity: ${conflict.entityType}`);
  }

  await prisma.conflictQueue.update({
    where: { id: resolution.conflictId },
    data: {
      status: resolution.resolution === "local" ? "resolved_local" : "resolved_remote",
      resolvedValue: winningValue as unknown as Prisma.InputJsonValue,
      resolvedByUserId: userId,
      resolvedAt: new Date(),
    },
  });
}

// ── Device registry ────────────────────────────────────────────────────

export async function listDevices(
  prisma: PrismaClient,
  organizationId: string,
  userId: string,
) {
  const devices = await prisma.syncDevice.findMany({
    where: { organizationId, userId },
    orderBy: { lastSyncAt: "desc" },
  });

  return devices.map((d) => ({
    id: d.id,
    fingerprint: d.fingerprint,
    platform: d.platform,
    lastSyncAt: d.lastSyncAt?.toISOString() ?? null,
    pendingCount: d.pendingCount,
    isActive: d.isActive,
    createdAt: d.createdAt.toISOString(),
  }));
}

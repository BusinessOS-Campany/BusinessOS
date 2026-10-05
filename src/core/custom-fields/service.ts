import { z } from "zod";
import type { Prisma, PrismaClient } from "@/core/db/generated/prisma/client";
import { ApiError } from "@/core/http/api";
import { prisma } from "@/core/db/client";
import { writeAuditLog } from "@/core/audit/service";
import {
  isCustomFieldEntity,
  isCustomFieldType,
  storageKind,
  type FieldRules,
} from "./types";
import { encryptValue, isEncrypted } from "./crypto";
import { evaluateFormula, validateFormula } from "./formula";

export interface TenantRef {
  organizationId: string;
  userId?: string;
}

const rulesSchema = z
  .object({
    required: z.boolean().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    regex: z.string().max(200).optional(),
    visibleWhen: z
      .object({
        key: z.string().min(1),
        op: z.enum(["eq", "neq", "in", "empty", "notEmpty"]),
        value: z.unknown().optional(),
      })
      .optional(),
  })
  .strict();

export const fieldCreateSchema = z.object({
  entityType: z.string().min(1),
  key: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z][a-z0-9_]*$/, "Key must be lower_snake_case"),
  nameAr: z.string().min(1).max(120),
  nameEn: z.string().max(120).optional(),
  type: z.string().min(1),
  options: z.record(z.string(), z.unknown()).optional(),
  rules: rulesSchema.optional(),
  isUnique: z.boolean().optional(),
  hasIndex: z.boolean().optional(),
  isEncrypted: z.boolean().optional(),
  formula: z.string().max(500).optional(),
});

export type FieldCreateInput = z.infer<typeof fieldCreateSchema>;

export async function createCustomField(tenant: TenantRef, input: FieldCreateInput) {
  if (!isCustomFieldEntity(input.entityType)) {
    throw ApiError.badRequest(`Custom fields not supported for entity "${input.entityType}"`);
  }
  if (!isCustomFieldType(input.type)) {
    throw ApiError.badRequest(`Unknown field type "${input.type}"`);
  }
  if (input.type === "formula") {
    if (!input.formula) throw ApiError.badRequest("Formula fields require an expression");
    const siblings = await prisma.customField.findMany({
      where: { organizationId: tenant.organizationId, entityType: input.entityType },
      select: { key: true },
    });
    try {
      validateFormula(input.formula, [...siblings.map((s) => s.key), input.key]);
    } catch (err) {
      throw ApiError.badRequest(
        `Invalid formula: ${err instanceof Error ? err.message : "parse error"}`,
      );
    }
  }
  if (input.isEncrypted) {
    if (!["text", "textarea", "email", "phone", "url", "json"].includes(input.type)) {
      throw ApiError.badRequest("Only textual types can be encrypted");
    }
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const field = await tx.customField.create({
        data: {
          organizationId: tenant.organizationId,
          entityType: input.entityType,
          key: input.key,
          nameAr: input.nameAr,
          nameEn: input.nameEn,
          type: input.type,
          options: (input.options ?? undefined) as never,
          rules: (input.rules ?? undefined) as never,
          isUnique: input.isUnique ?? false,
          hasIndex: input.hasIndex ?? false,
          isEncrypted: input.isEncrypted ?? false,
          formula: input.formula,
        },
      });
      await writeAuditLog(tx, tenant, {
        action: "custom_field.created",
        entityType: "custom_field",
        entityId: field.id,
        after: { key: field.key, type: field.type, target: field.entityType },
      });
      return field;
    });
  } catch (err) {
    if (err instanceof Error && /unique/i.test(err.message)) {
      throw ApiError.conflict(`Field key "${input.key}" already exists on ${input.entityType}`);
    }
    throw err;
  }
}

export const fieldUpdateSchema = z.object({
  nameAr: z.string().min(1).max(120).optional(),
  nameEn: z.string().max(120).optional(),
  options: z.record(z.string(), z.unknown()).optional(),
  rules: rulesSchema.optional(),
  isUnique: z.boolean().optional(),
  hasIndex: z.boolean().optional(),
  isEncrypted: z.boolean().optional(),
  formula: z.string().max(500).optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export type FieldUpdateInput = z.infer<typeof fieldUpdateSchema>;

export async function updateCustomField(tenant: TenantRef, fieldId: string, input: FieldUpdateInput) {
  const existing = await prisma.customField.findFirst({
    where: { id: fieldId, organizationId: tenant.organizationId },
  });
  if (!existing) throw ApiError.notFound("Custom field not found");

  if (input.formula !== undefined) {
    if (!input.formula) throw ApiError.badRequest("Formula expression cannot be empty");
    const siblings = await prisma.customField.findMany({
      where: { organizationId: tenant.organizationId, entityType: existing.entityType, id: { not: fieldId } },
      select: { key: true },
    });
    try {
      validateFormula(input.formula, [...siblings.map((s) => s.key), existing.key]);
    } catch (err) {
      throw ApiError.badRequest(
        `Invalid formula: ${err instanceof Error ? err.message : "parse error"}`,
      );
    }
  }

  return await prisma.$transaction(async (tx) => {
    const updated = await tx.customField.update({
      where: { id: fieldId },
      data: {
        ...(input.nameAr !== undefined && { nameAr: input.nameAr }),
        ...(input.nameEn !== undefined && { nameEn: input.nameEn }),
        ...(input.options !== undefined && { options: input.options as never }),
        ...(input.rules !== undefined && { rules: input.rules as never }),
        ...(input.isUnique !== undefined && { isUnique: input.isUnique }),
        ...(input.hasIndex !== undefined && { hasIndex: input.hasIndex }),
        ...(input.isEncrypted !== undefined && { isEncrypted: input.isEncrypted }),
        ...(input.formula !== undefined && { formula: input.formula }),
        ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
    });
    await writeAuditLog(tx, tenant, {
      action: "custom_field.updated",
      entityType: "custom_field",
      entityId: fieldId,
      after: { key: updated.key, changes: input },
    });
    return updated;
  });
}

export async function deleteCustomField(tenant: TenantRef, fieldId: string) {
  const existing = await prisma.customField.findFirst({
    where: { id: fieldId, organizationId: tenant.organizationId },
  });
  if (!existing) throw ApiError.notFound("Custom field not found");

  // Soft-delete: set isActive=false, wipe formula
  return await prisma.$transaction(async (tx) => {
    await tx.customField.update({
      where: { id: fieldId },
      data: { isActive: false, formula: null },
    });
    await writeAuditLog(tx, tenant, {
      action: "custom_field.deleted",
      entityType: "custom_field",
      entityId: fieldId,
      after: { key: existing.key },
    });
    return { id: fieldId };
  });
}

export async function listCustomFields(organizationId: string, entityType?: string) {
  return prisma.customField.findMany({
    where: {
      organizationId,
      ...(entityType ? { entityType } : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

/** Server-side validation of one submitted value against its field def. */
export function validateFieldValue(fieldDef: {
  type: string;
  rules?: unknown;
}, raw: unknown): unknown {
  const rules = (fieldDef.rules ?? {}) as FieldRules;

  if (raw === null || raw === undefined || raw === "") {
    if (rules.required) throw ApiError.badRequest("A required custom field is empty");
    return null;
  }

  const kind = storageKind(isCustomFieldType(fieldDef.type) ? fieldDef.type : "text");

  if (kind === "number") {
    const n = Number(raw);
    if (!Number.isFinite(n)) throw ApiError.badRequest("Expected a number");
    if (rules.min !== undefined && n < rules.min) throw ApiError.badRequest(`Minimum is ${rules.min}`);
    if (rules.max !== undefined && n > rules.max) throw ApiError.badRequest(`Maximum is ${rules.max}`);
    return n;
  }
  if (kind === "date") {
    const d = new Date(String(raw));
    if (Number.isNaN(d.getTime())) throw ApiError.badRequest("Invalid date/time");
    return d;
  }
  if (kind === "bool") {
    return Boolean(raw);
  }
  // text-ish
  const s = String(raw);
  if (rules.min !== undefined && s.length < rules.min) throw ApiError.badRequest(`Minimum length is ${rules.min}`);
  if (rules.max !== undefined && s.length > rules.max) throw ApiError.badRequest(`Maximum length is ${rules.max}`);
  if (rules.regex && !new RegExp(rules.regex).test(s)) {
    throw ApiError.badRequest("Value does not match the expected pattern");
  }
  return s;
}

/**
 * Upserts submitted custom values for an entity row. Enforces unique-flag
 * (per org+field, excluding the same entity) and stores per storage kind.
 * Runs INSIDE the caller's tx when provided so it rolls back with the parent.
 */
export async function saveCustomFieldValues(
  txHost: Prisma.TransactionClient | PrismaClient,
  tenant: TenantRef,
  entityType: string,
  entityId: string,
  submitted: Record<string, unknown>,
): Promise<void> {
  const keys = Object.keys(submitted);
  if (keys.length === 0) return;

  const defs = await txHost.customField.findMany({
    where: {
      organizationId: tenant.organizationId,
      entityType,
      key: { in: keys },
      isActive: true,
    },
  });

  for (const def of defs) {
    // Formula fields are computed at read time — never accepted from clients.
    if (def.type === "formula") continue;
    const value = validateFieldValue({ type: def.type, rules: def.rules }, submitted[def.key]);

    // Conditional visibility: a hidden field's submission is ignored.
    const rules = (def.rules ?? {}) as FieldRules;
    if (rules.visibleWhen) {
      const dep = defs.find((d) => d.key === rules.visibleWhen!.key);
      const depVal = dep ? submitted[dep.key] : undefined;
      if (!isVisible(rules.visibleWhen, depVal)) continue;
    }

    if (def.isUnique && value !== null) {
      const probe =
        typeof value === "number"
          ? { valueNumber: value }
          : value instanceof Date
            ? { valueDate: value }
            : typeof value === "boolean"
              ? { valueBool: value }
              : { valueText: String(value) };
      const clash = await txHost.customFieldValue.findFirst({
        where: {
          fieldId: def.id,
          organizationId: tenant.organizationId,
          entityId: { not: entityId },
          ...probe,
        },
        select: { id: true },
      });
      if (clash) throw ApiError.conflict(`Value already used for "${def.key}"`);
    }

    const data =
      value === null
        ? { valueText: null, valueNumber: null, valueDate: null, valueBool: null }
        : typeof value === "number"
          ? { valueNumber: value }
          : value instanceof Date
            ? { valueDate: value }
            : typeof value === "boolean"
              ? { valueBool: value }
              : (() => {
                  const s = String(value);
                  return def.isEncrypted ? { valueText: encryptValue(s) } : { valueText: s };
                })();

    await txHost.customFieldValue.upsert({
      where: { fieldId_entityId: { fieldId: def.id, entityId } },
      create: {
        organizationId: tenant.organizationId,
        fieldId: def.id,
        entityType,
        entityId,
        ...data,
      },
      update: data,
    });
  }
}

function isVisible(
  cond: NonNullable<FieldRules["visibleWhen"]>,
  depVal: unknown,
): boolean {
  switch (cond.op) {
    case "eq":
      return depVal === cond.value;
    case "neq":
      return depVal !== cond.value;
    case "in":
      return Array.isArray(cond.value) && cond.value.includes(depVal);
    case "empty":
      return depVal === undefined || depVal === null || depVal === "";
    case "notEmpty":
      return !(depVal === undefined || depVal === null || depVal === "");
  }
}

/** Reads all custom values for an entity row (decrypting where flagged). */
export async function loadCustomFieldValues(
  organizationId: string,
  entityType: string,
  entityId: string,
): Promise<Record<string, unknown>> {
  const defs = await prisma.customField.findMany({
    where: { organizationId, entityType },
    select: { id: true, key: true, type: true, isEncrypted: true, formula: true },
  });
  const values: Record<string, unknown> = {};

  // Batch-fetch all field values for this entity in one query (avoids N+1)
  const fieldIds = defs.filter((d) => d.type !== "formula").map((d) => d.id);
  const allValues = fieldIds.length > 0
    ? await prisma.customFieldValue.findMany({
        where: { fieldId: { in: fieldIds }, entityId },
        select: { fieldId: true, valueText: true, valueNumber: true, valueDate: true, valueBool: true },
      })
    : [];
  const valueByFieldId = new Map(allValues.map((v) => [v.fieldId, v]));

  for (const def of defs) {
    if (def.type === "formula") continue;
    const v = valueByFieldId.get(def.id);
    if (!v) continue;
    const kind = storageKind(isCustomFieldType(def.type) ? def.type : "text");
    if (kind === "number") values[def.key] = v.valueNumber;
    else if (kind === "date") values[def.key] = v.valueDate?.toISOString() ?? null;
    else if (kind === "bool") values[def.key] = v.valueBool;
    else if (v.valueText !== null)
      values[def.key] = def.isEncrypted && isEncrypted(v.valueText) ? "<encrypted>" : v.valueText;
  }
  // Compute formula fields last so they see every stored value.
  for (const def of defs) {
    if (def.type !== "formula" || !def.formula) continue;
    try {
      values[def.key] = evaluateFormula(
        def.formula,
        Object.fromEntries(
          Object.entries(values).map(([k, v]) => [k.toUpperCase(), Number(v) || 0]),
        ),
      );
    } catch {
      // A broken formula must never break entity reads.
      values[def.key] = null;
    }
  }
  return values;
}

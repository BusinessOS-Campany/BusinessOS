/**
 * The 21 custom-field types. Storage mapping:
 *   text-ish → valueText · numeric → valueNumber · temporal → valueDate
 *   boolean-ish → valueBool (checkbox/boolean/toggle) · encrypted → valueText
 */
export const CUSTOM_FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "decimal",
  "currency",
  "percent",
  "date",
  "datetime",
  "time",
  "boolean",
  "select",
  "multiselect",
  "radio",
  "checkbox",
  "url",
  "email",
  "phone",
  "color",
  "rating",
  "json",
  "formula",
] as const;

export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

const TYPE_SET = new Set<string>(CUSTOM_FIELD_TYPES);

export function isCustomFieldType(t: string): t is CustomFieldType {
  return TYPE_SET.has(t);
}

/** Which storage column backs a type. */
export function storageKind(t: CustomFieldType): "text" | "number" | "date" | "bool" {
  switch (t) {
    case "number":
    case "decimal":
    case "currency":
    case "percent":
    case "rating":
      return "number";
    case "date":
    case "datetime":
    case "time":
      return "date";
    case "boolean":
    case "checkbox":
      return "bool";
    default:
      return "text";
  }
}

/** Entities that accept custom fields (grows with milestones). */
export const CUSTOM_FIELD_ENTITIES = ["products", "customers", "suppliers"] as const;
export type CustomFieldEntity = (typeof CUSTOM_FIELD_ENTITIES)[number];

export function isCustomFieldEntity(e: string): e is CustomFieldEntity {
  return (CUSTOM_FIELD_ENTITIES as readonly string[]).includes(e);
}

export interface FieldRules {
  required?: boolean;
  min?: number;
  max?: number;
  regex?: string;
  /** Conditional visibility: show only when another field matches. */
  visibleWhen?: { key: string; op: "eq" | "neq" | "in" | "empty" | "notEmpty"; value?: unknown };
}

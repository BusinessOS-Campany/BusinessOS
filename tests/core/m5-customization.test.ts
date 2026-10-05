import "@/core/config/load-env";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/core/db/client";
import {
  createCustomField,
  updateCustomField,
  deleteCustomField,
  listCustomFields,
  saveCustomFieldValues,
  loadCustomFieldValues,
  validateFieldValue,
} from "@/core/custom-fields/service";
import { evaluateFormula, validateFormula, FormulaError } from "@/core/custom-fields/formula";
import { encryptValue, decryptValue, isEncrypted } from "@/core/custom-fields/crypto";
import { runReport } from "@/core/reports/builder";

let orgId = "";
let userId = "";
const tenant = () => ({ organizationId: orgId, userId });
let productId = "";

async function purge(oid: string) {
  const tables = [
    "customFieldValue", "customField", "savedView", "dashboardLayout",
    "salesReturnItem", "salesReturn", "salesInvoiceItem", "payment", "salesInvoice",
    "purchaseItem", "purchase", "stockMovement", "stockLevel", "expense", "cashMovement",
    "numberSequence", "customer", "supplier", "product", "warehouse", "cashAccount",
    "expenseCategory", "category", "unit", "auditLog", "member",
  ] as const;
  for (const t of tables) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any)[t].deleteMany({ where: { organizationId: oid } });
  }
  await prisma.organization.delete({ where: { id: oid } });
}

beforeAll(async () => {
  userId = `u-${randomUUID().slice(0, 8)}`;
  await prisma.user.create({
    data: { id: userId, name: "M5 Tester", emailVerified: false, email: `m5-${randomUUID().slice(0, 8)}@test.local` },
  });
  orgId = randomUUID();
  await prisma.organization.create({ data: { id: orgId, name: "M5 Org", slug: `m5-${randomUUID().slice(0, 12)}` } });
  await prisma.member.create({
    data: { id: randomUUID(), organizationId: orgId, userId, role: "owner" },
  });

  productId = (
    await prisma.product.create({
      data: {
        organizationId: orgId, sku: "M5-SKU-001", nameAr: "منتج M5",
        costPrice: 100n, salePrice: 200n, taxRateBps: 0,
      },
    })
  ).id;
});

afterAll(async () => {
  await purge(orgId);
});

// ── Formula parser ────────────────────────────────────────────────────────
describe("Formula parser (M5.2 safe sandbox)", () => {
  it("evaluates basic arithmetic", () => {
    expect(evaluateFormula("2 + 3 * 4", {})).toBe(14);
    expect(evaluateFormula("(2 + 3) * 4", {})).toBe(20);
    expect(evaluateFormula("10 - 3 - 2", {})).toBe(5);
  });

  it("evaluates exponentiation", () => {
    expect(evaluateFormula("2 ^ 3", {})).toBe(8);
    expect(evaluateFormula("3 ^ 0.5", {})).toBeCloseTo(1.732, 2);
  });

  it("evaluates whitelisted functions", () => {
    const scope = { A: 10, B: 20, C: -5 };
    expect(evaluateFormula("MIN(A, B, C)", scope)).toBe(-5);
    expect(evaluateFormula("MAX(A, B)", scope)).toBe(20);
    expect(evaluateFormula("ABS(C)", scope)).toBe(5);
    expect(evaluateFormula("ROUND(A / 3)", scope)).toBe(3);
    expect(evaluateFormula("FLOOR(A / 3)", scope)).toBe(3);
    expect(evaluateFormula("CEIL(A / 3)", scope)).toBe(4);
  });

  it("resolves identifiers from scope", () => {
    expect(evaluateFormula("PRICE * QTY", { PRICE: 100, QTY: 3 })).toBe(300);
  });

  it("division by zero throws", () => {
    expect(() => evaluateFormula("10 / 0", {})).toThrow(FormulaError);
  });

  it("unknown function throws", () => {
    expect(() => validateFormula("EXEC('rm -rf /')", [])).toThrow(FormulaError);
  });

  it("unknown identifier throws", () => {
    expect(() => evaluateFormula("UNKNOWN_VAR", {})).toThrow(FormulaError);
  });

  it("injection: SQL-like syntax throws", () => {
    const attacks = [
      "1; DROP TABLE users",
      "' OR 1=1 --",
      "${process.env.SECRET}",
      "require('child_process').exec('x')",
      "A.B.C",
      "`backtick`",
      '"double"',
    ];
    for (const formula of attacks) {
      expect(() => evaluateFormula(formula, {})).toThrow(FormulaError);
    }
  });

  it("injection: function construction attempts throw", () => {
    const attacks = [
      "Function('return this')()",
      "eval('1+1')",
      "constructor('return this')()",
    ];
    for (const formula of attacks) {
      expect(() => validateFormula(formula, [])).toThrow(FormulaError);
    }
  });

  it("malformed number throws", () => {
    expect(() => evaluateFormula("1.2.3", {})).toThrow(FormulaError);
  });

  it("missing closing paren throws", () => {
    expect(() => evaluateFormula("(2 + 3", {})).toThrow(FormulaError);
  });

  it("validateFormula rejects unknown keys", () => {
    expect(() => validateFormula("X + Y", ["A", "B"])).toThrow(FormulaError);
  });

  it("validateFormula accepts known keys", () => {
    expect(() => validateFormula("A + B", ["A", "B"])).not.toThrow();
  });

  it("nested function calls", () => {
    expect(evaluateFormula("MAX(ABS(-10), ROUND(5.7))", {})).toBe(10);
  });
});

// ── Crypto ────────────────────────────────────────────────────────────────
describe("AES-256-GCM encryption", () => {
  it("encrypts and roundtrips", () => {
    const plain = "sensitive-data-12345";
    const enc = encryptValue(plain);
    expect(isEncrypted(enc)).toBe(true);
    expect(enc).toMatch(/^enc:v1:/);
    expect(decryptValue(enc)).toBe(plain);
  });

  it("decryption fails with tampered ciphertext", () => {
    const enc = encryptValue("original");
    const parts = enc.split(":");
    parts[4] = "TAMPERED";
    const tampered = parts.join(":");
    expect(() => decryptValue(tampered)).toThrow();
  });
});

// ── Custom field CRUD ─────────────────────────────────────────────────────
describe("Custom field CRUD", () => {
  let fieldId = "";
  let fieldId2 = "";

  it("creates a text field", async () => {
    const field = await createCustomField(tenant(), {
      entityType: "products",
      key: "origin_country",
      nameAr: "بلد المنشأ",
      type: "text",
    });
    fieldId = field.id;
    expect(field.key).toBe("origin_country");
    expect(field.isActive).toBe(true);
  });

  it("creates a numeric field", async () => {
    const field = await createCustomField(tenant(), {
      entityType: "products",
      key: "shelf_life_days",
      nameAr: "مدة الصلاحية (أيام)",
      type: "number",
      rules: { required: false, min: 0, max: 3650 },
    });
    fieldId2 = field.id;
    expect(field.type).toBe("number");
  });

  it("rejects duplicate key on same entity", async () => {
    await expect(
      createCustomField(tenant(), {
        entityType: "products",
        key: "origin_country",
        nameAr: "بلد المنشأ (مكرر)",
        type: "text",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("allows same key on different entity", async () => {
    const field = await createCustomField(tenant(), {
      entityType: "customers",
      key: "origin_country",
      nameAr: "بلد المنشأ",
      type: "text",
    });
    expect(field.entityType).toBe("customers");
  });

  it("updates field name", async () => {
    const updated = await updateCustomField(tenant(), fieldId, {
      nameAr: "بلد المنشأ المحدث",
    });
    expect(updated.nameAr).toBe("بلد المنشأ المحدث");
  });

  it("soft-deletes a field", async () => {
    const result = await deleteCustomField(tenant(), fieldId);
    expect(result.id).toBe(fieldId);
    const fields = await listCustomFields(orgId, "products");
    const deleted = fields.find((f) => f.id === fieldId);
    expect(deleted?.isActive).toBe(false);
  });

  it("rejects invalid entity type", async () => {
    await expect(
      createCustomField(tenant(), {
        entityType: "invoices",
        key: "test",
        nameAr: "اختبار",
        type: "text",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects invalid field type", async () => {
    await expect(
      createCustomField(tenant(), {
        entityType: "products",
        key: "test",
        nameAr: "اختبار",
        type: "file_upload",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("encrypted flag only allowed on textual types", async () => {
    await expect(
      createCustomField(tenant(), {
        entityType: "products",
        key: "secret_number",
        nameAr: "رقم سري",
        type: "number",
        isEncrypted: true,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("creates encrypted text field", async () => {
    const field = await createCustomField(tenant(), {
      entityType: "products",
      key: "secret_code",
      nameAr: "كود سري",
      type: "text",
      isEncrypted: true,
    });
    expect(field.isEncrypted).toBe(true);
  });

  it("cleanup", async () => {
    await deleteCustomField(tenant(), fieldId2);
  });
});

// ── Field value validation ────────────────────────────────────────────────
describe("validateFieldValue", () => {
  it("passes valid text", () => {
    expect(validateFieldValue({ type: "text" }, "hello")).toBe("hello");
  });

  it("rejects required empty", () => {
    expect(() =>
      validateFieldValue({ type: "text", rules: { required: true } }, ""),
    ).toThrow("required");
  });

  it("passes null when not required", () => {
    expect(validateFieldValue({ type: "text" }, null)).toBeNull();
  });

  it("validates number min/max", () => {
    expect(validateFieldValue({ type: "number", rules: { min: 0, max: 100 } }, 50)).toBe(50);
    expect(() =>
      validateFieldValue({ type: "number", rules: { min: 0 } }, -1),
    ).toThrow("Minimum");
    expect(() =>
      validateFieldValue({ type: "number", rules: { max: 100 } }, 200),
    ).toThrow("Maximum");
  });

  it("validates date", () => {
    expect(validateFieldValue({ type: "date" }, "2026-01-15")).toBeInstanceOf(Date);
    expect(() => validateFieldValue({ type: "date" }, "not-a-date")).toThrow("Invalid date");
  });

  it("validates boolean", () => {
    expect(validateFieldValue({ type: "boolean" }, true)).toBe(true);
    expect(validateFieldValue({ type: "boolean" }, 0)).toBe(false);
  });

  it("validates text regex", () => {
    const rules = { regex: "^[A-Z]{3}$" };
    expect(validateFieldValue({ type: "text", rules }, "ABC")).toBe("ABC");
    expect(() => validateFieldValue({ type: "text", rules }, "abc")).toThrow("pattern");
  });
});

// ── Field value upsert + load ─────────────────────────────────────────────
describe("Custom field values (EAV storage)", () => {
  let textFieldId = "";
  let numFieldId = "";

  beforeAll(async () => {
    const tf = await createCustomField(tenant(), {
      entityType: "products",
      key: "color_en",
      nameAr: "اللون (إنجليزي)",
      type: "text",
    });
    textFieldId = tf.id;

    const nf = await createCustomField(tenant(), {
      entityType: "products",
      key: "weight_grams",
      nameAr: "الوزن بالجرام",
      type: "number",
      rules: { min: 0 },
    });
    numFieldId = nf.id;
  });

  it("upserts and loads values", async () => {
    await prisma.$transaction(async (tx) => {
      await saveCustomFieldValues(tx, tenant(), "products", productId, {
        color_en: "Red",
        weight_grams: 500,
      });
    });

    const values = await loadCustomFieldValues(orgId, "products", productId);
    expect(values.color_en).toBe("Red");
    expect(values.weight_grams).toBe(500);
  });

  it("updates value on second upsert", async () => {
    await prisma.$transaction(async (tx) => {
      await saveCustomFieldValues(tx, tenant(), "products", productId, {
        color_en: "Blue",
        weight_grams: 750,
      });
    });

    const values = await loadCustomFieldValues(orgId, "products", productId);
    expect(values.color_en).toBe("Blue");
    expect(values.weight_grams).toBe(750);
  });

  it("validates on upsert: rejects negative number", async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await saveCustomFieldValues(tx, tenant(), "products", productId, {
          weight_grams: -10,
        });
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("returns null for unset fields", async () => {
    const values = await loadCustomFieldValues(orgId, "products", productId);
    // weight_grams was set above
    expect(values.weight_grams).toBe(750);
  });

  afterAll(async () => {
    await deleteCustomField(tenant(), textFieldId);
    await deleteCustomField(tenant(), numFieldId);
  });
});

// ── Report builder ────────────────────────────────────────────────────────
describe("Report builder compiler (M5.4)", () => {
  beforeAll(async () => {
    // Seed a product for the report query
    // Product was created in beforeAll above with orgId
  });

  it("runs a basic product report", async () => {
    const result = await runReport(orgId, {
      dataset: "products",
      measures: [{ key: "sale_price", agg: "sum" }],
      limit: 10,
    });
    expect(result.columns).toContain("sum_sale_price");
    expect(result.rows.length).toBeGreaterThanOrEqual(1);
  });

  it("rejects invalid dimension", async () => {
    await expect(
      runReport(orgId, {
        dataset: "products",
        groupBy: ["nonexistent_column"],
        measures: [{ key: "salePrice", agg: "count" }],
        limit: 10,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects invalid measure", async () => {
    await expect(
      runReport(orgId, {
        dataset: "products",
        measures: [{ key: "DROP_TABLE", agg: "sum" }],
        limit: 10,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects invalid filter key", async () => {
    await expect(
      runReport(orgId, {
        dataset: "products",
        measures: [{ key: "sale_price", agg: "count" }],
        filters: [{ key: "sql_injection", op: "eq", value: "1" }],
        limit: 10,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects invalid dataset", async () => {
    await expect(
      runReport(orgId, {
        dataset: "users" as "products",
        measures: [{ key: "id", agg: "count" }],
        limit: 10,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("runs a filtered report", async () => {
    const result = await runReport(orgId, {
      dataset: "products",
      measures: [{ key: "sale_price", agg: "avg", alias: "avg_price" }],
      filters: [{ key: "sku", op: "contains", value: "M5" }],
      limit: 5,
    });
    expect(result.columns).toContain("avg_price");
    expect(result.rows.length).toBeGreaterThanOrEqual(1);
  });

  it("computed columns via formula", async () => {
    const result = await runReport(orgId, {
      dataset: "products",
      measures: [
        { key: "sale_price", agg: "sum", alias: "total_sales" },
        { key: "cost_price", agg: "sum", alias: "total_cost" },
      ],
      computedColumns: [{ name: "margin_pct", formula: "ROUND((TOTAL_SALES - TOTAL_COST) / TOTAL_SALES * 100)" }],
      limit: 10,
    });
    expect(result.columns).toContain("margin_pct");
  });
});

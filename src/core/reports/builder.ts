import { z } from "zod";
import { ApiError } from "@/core/http/api";
import type { Prisma } from "@/core/db/generated/prisma/client";
import { prisma } from "@/core/db/client";
import { evaluateFormula, FormulaError, validateFormula } from "@/core/custom-fields/formula";

/**
 * Report builder compiler. STRICTLY whitelisted: datasets, dimensions,
 * measures and filter keys resolve through the maps below — anything not
 * listed is rejected before touching SQL (no string interpolation of user
 * identifiers; values are always bound parameters).
 *
 * All keys use actual DB column names (snake_case via Prisma @map).
 */

export const DATASETS = {
  products: {
    table: "products",
    dims: ["sku", "barcode", "name_ar", "name_en", "category_id", "is_active"],
    measures: ["sale_price", "cost_price", "wholesale_price"],
  },
  sales: {
    table: "sales_invoices",
    dims: ["number", "customer_id", "warehouse_id", "status"],
    measures: ["subtotal", "discount_total", "tax_total", "total", "paid_total"],
  },
  customers: {
    table: "customers",
    dims: ["name", "phone", "email", "is_active"],
    measures: ["credit_limit", "balance"],
  },
  suppliers: {
    table: "suppliers",
    dims: ["name", "phone"],
    measures: ["balance"],
  },
  expenses: {
    table: "expenses",
    dims: ["category_id", "cash_account_id"],
    measures: ["amount"],
  },
} as const;

const AGGS = ["sum", "avg", "count", "min", "max"] as const;
const FILTER_OPS = ["eq", "neq", "gt", "gte", "lt", "lte", "contains"] as const;

const datasetSchema = z.enum(Object.keys(DATASETS) as [keyof typeof DATASETS]);
const aggSchema = z.enum(AGGS);
const opSchema = z.enum(FILTER_OPS);

export const reportSpecSchema = z
  .object({
    dataset: datasetSchema,
    groupBy: z.array(z.string().max(40)).max(3).default([]),
    measures: z
      .array(
        z.object({
          key: z.string().max(60),
          agg: aggSchema,
          alias: z.string().max(40).optional(),
        }),
      )
      .min(1)
      .max(6),
    filters: z
      .array(
        z.object({
          key: z.string().max(60),
          op: opSchema,
          value: z.union([z.string().max(120), z.number(), z.boolean()]),
        }),
      )
      .max(8)
      .default([]),
    /** Optional computed post-aggregation column via safe formula over aliases. */
    computedColumns: z
      .array(
        z.object({
          name: z.string().max(40).regex(/^[a-z][a-z0-9_]*$/),
          formula: z.string().max(300),
        }),
      )
      .max(4)
      .default([]),
    limit: z.number().int().min(1).max(1000).default(200),
  })
  .strict();

export type ReportSpec = z.infer<typeof reportSpecSchema>;

const IDENT_OK = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/** Compiles + executes a whitelisted aggregate report. */
export async function runReport(
  organizationId: string,
  spec: z.input<typeof reportSpecSchema>,
): Promise<{ columns: string[]; rows: Array<Record<string, unknown>> }> {
  // Parse through zod to apply defaults (groupBy, filters, computedColumns, limit).
  let parsed: ReportSpec;
  try {
    parsed = reportSpecSchema.parse(spec);
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw ApiError.badRequest(err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    }
    throw err;
  }
  const ds = DATASETS[parsed.dataset];

  // ── identifier whitelist pass ────────────────────────────────────────────
  for (const dim of parsed.groupBy) {
    if (!(ds.dims as readonly string[]).includes(dim)) {
      throw ApiError.badRequest(`Dimension "${dim}" is not available on ${parsed.dataset}`);
    }
  }
  for (const f of parsed.filters) {
    if (!(ds.dims as readonly string[]).includes(f.key)) {
      throw ApiError.badRequest(`Filter key "${f.key}" is not filterable on ${parsed.dataset}`);
    }
  }
  for (const m of parsed.measures) {
    if (!IDENT_OK.test(m.key)) throw ApiError.badRequest("Invalid measure key");
    if (!(ds.measures as readonly string[]).includes(m.key)) {
      throw ApiError.badRequest(`Measure "${m.key}" is not available on ${parsed.dataset}`);
    }
  }

  // ── build parameterized raw SQL ──────────────────────────────────────────
  const selectParts: string[] = [];
  const groupParts: string[] = [];
  const params: unknown[] = [organizationId];
  let p = 1;

  for (const dim of parsed.groupBy) {
    selectParts.push(`"${ds.table}"."${dim}" AS "${dim}"`);
    groupParts.push(`"${ds.table}"."${dim}"`);
  }

  parsed.measures.forEach((m) => {
    const alias = m.alias ?? `${m.agg}_${m.key}`;
    if (!IDENT_OK.test(alias)) throw ApiError.badRequest("Invalid measure alias");
    if (m.agg === "count") {
      selectParts.push(`COUNT(*)::float8 AS "${alias}"`);
    } else {
      // Money columns are bigint; cast to float8 for aggregates.
      selectParts.push(`${m.agg.toUpperCase()}("${ds.table}"."${m.key}"::float8) AS "${alias}"`);
    }
  });

  let whereSql = `"${ds.table}"."organization_id" = $1`;
  for (const f of parsed.filters) {
    p += 1;
    params.push(f.value);
    if (f.op === "contains") {
      whereSql += ` AND "${ds.table}"."${f.key}" ILIKE '%' || $${p} || '%'`;
    } else {
      const cmp = f.op === "eq" ? "=" : f.op === "neq" ? "<>" : f.op.toUpperCase();
      whereSql += ` AND "${ds.table}"."${f.key}"::text ${cmp} $${p}`;
    }
  }

  const groupSql = groupParts.length ? ` GROUP BY ${groupParts.join(", ")}` : "";
  const sql = `SELECT ${selectParts.join(", ")} FROM "${ds.table}" WHERE ${whereSql}${groupSql} LIMIT ${parsed.limit}`;

  const rows: Array<Record<string, unknown>> = await prisma.$queryRawUnsafe(sql, ...params);

  // ── computed columns via the safe formula parser only ────────────────────
  if (parsed.computedColumns.length > 0 && rows.length > 0) {
    for (const cc of parsed.computedColumns) {
      const sampleScope: Record<string, number> = Object.fromEntries(
        Object.keys(rows[0]!).map((k) => [k.toUpperCase(), 1]),
      );
      try {
        validateFormulaSafe(cc.formula, sampleScope);
      } catch (err) {
        throw ApiError.badRequest(
          `Computed column "${cc.name}": ${err instanceof FormulaError ? err.message : "invalid formula"}`,
        );
      }
    }
    for (const row of rows) {
      const scope: Record<string, number> = {};
      for (const [k, v] of Object.entries(row)) scope[k.toUpperCase()] = Number(v) || 0;
      for (const cc of parsed.computedColumns) {
        row[cc.name] = safeEval(cc.formula, scope);
      }
    }
  }

  const columns = [
    ...parsed.groupBy,
    ...parsed.measures.map((m) => m.alias ?? `${m.agg}_${m.key}`),
    ...parsed.computedColumns.map((c) => c.name),
  ];
  return { columns, rows };
}

function validateFormulaSafe(formula: string, scope: Record<string, number>): void {
  // Throws FormulaError on any non-whitelisted token.
  validateFormula(formula, Object.keys(scope));
}

function safeEval(formula: string, scope: Record<string, number>): number | null {
  try {
    return evaluateFormula(formula, scope);
  } catch {
    return null;
  }
}

export type ReportTxClient = Prisma.TransactionClient;

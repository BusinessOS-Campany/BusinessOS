import { z } from "zod";

export const TOOL_KIND = ["read", "mutating"] as const;
export type ToolKind = (typeof TOOL_KIND)[number];

export interface ToolDefinition {
  name: string;
  description: string;
  descriptionAr: string;
  kind: ToolKind;
  /** Required permission module + action */
  permission: { module: string; action: string };
  /** Zod schema for tool args */
  argsSchema: z.ZodTypeAny;
}

// ── Read tools ──────────────────────────────────────────────────────────────

export const getSalesSummaryArgs = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  warehouseId: z.string().optional(),
});

export const getTopProductsArgs = z.object({
  limit: z.number().int().min(1).max(50).default(10),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const getDebtArgs = z.object({
  customerId: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

export const getInventoryArgs = z.object({
  warehouseId: z.string().optional(),
  lowOnly: z.boolean().default(false),
  categoryId: z.string().optional(),
});

export const searchArgs = z.object({
  query: z.string().min(1).max(200),
  entity: z.enum(["products", "customers", "suppliers"]).default("products"),
});

// ── Mutating tools ──────────────────────────────────────────────────────────

export const createCustomerArgs = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().max(50).optional(),
  email: z.string().email().optional(),
  creditLimit: z.number().int().min(0).default(0),
});

export const createProductArgs = z.object({
  nameAr: z.string().min(1).max(200),
  nameEn: z.string().max(200).optional(),
  sku: z.string().min(1).max(50),
  salePrice: z.number().int().min(0),
  costPrice: z.number().int().min(0).default(0),
  categoryId: z.string().optional(),
});

export const createExpenseArgs = z.object({
  amount: z.number().int().positive(),
  note: z.string().min(1).max(500),
  categoryId: z.string().optional(),
  cashAccountId: z.string().optional(),
});

export const createSaleDraftArgs = z.object({
  customerId: z.string().nullable().optional(),
  items: z.array(z.object({
    productId: z.string().min(1),
    qty: z.number().positive(),
    unitPrice: z.number().int().min(0).optional(),
  })).min(1).max(200),
});

export type GetSalesSummaryArgs = z.infer<typeof getSalesSummaryArgs>;
export type GetTopProductsArgs = z.infer<typeof getTopProductsArgs>;
export type GetDebtArgs = z.infer<typeof getDebtArgs>;
export type GetInventoryArgs = z.infer<typeof getInventoryArgs>;
export type SearchArgs = z.infer<typeof searchArgs>;
export type CreateCustomerArgs = z.infer<typeof createCustomerArgs>;
export type CreateProductArgs = z.infer<typeof createProductArgs>;
export type CreateExpenseArgs = z.infer<typeof createExpenseArgs>;
export type CreateSaleDraftArgs = z.infer<typeof createSaleDraftArgs>;

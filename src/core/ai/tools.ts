import type { ToolDefinition } from "./types";
import {
  getSalesSummaryArgs,
  getTopProductsArgs,
  getDebtArgs,
  getInventoryArgs,
  searchArgs,
  createCustomerArgs,
  createProductArgs,
  createExpenseArgs,
  createSaleDraftArgs,
} from "./types";

/**
 * Registry of all AI tools. Read tools answer immediately;
 * mutating tools return pending_action + confirmation token.
 */
export const TOOL_REGISTRY: ToolDefinition[] = [
  // ── Read tools ────────────────────────────────────────────────────────────
  {
    name: "get_sales_summary",
    description: "Get sales summary for a date range (total revenue, invoice count, average order value)",
    descriptionAr: "الحصول على ملخص المبيعات لنطاق زمني (إجمالي الإيرادات، عدد الفواتير، متوسط قيمة الطلب)",
    kind: "read",
    permission: { module: "sales", action: "read" },
    argsSchema: getSalesSummaryArgs,
  },
  {
    name: "get_top_products",
    description: "Get top selling products by quantity or revenue",
    descriptionAr: "الحصول على أكثر المنتجات مبيعاً حسب الكمية أو الإيرادات",
    kind: "read",
    permission: { module: "sales", action: "read" },
    argsSchema: getTopProductsArgs,
  },
  {
    name: "get_debt",
    description: "Get customer debt/credit balances",
    descriptionAr: "الحصول على أرصدة الديون/الآجال للعملاء",
    kind: "read",
    permission: { module: "sales", action: "read" },
    argsSchema: getDebtArgs,
  },
  {
    name: "get_inventory",
    description: "Get inventory levels, optionally filtered by warehouse or low stock",
    descriptionAr: "الحصول على مستويات المخزون، مع فلترة اختيارية حسب المستودع أو المخزون المنخفض",
    kind: "read",
    permission: { module: "inventory", action: "read" },
    argsSchema: getInventoryArgs,
  },
  {
    name: "search",
    description: "Search products, customers, or suppliers by name/SKU/phone",
    descriptionAr: "البحث عن المنتجات أو العملاء أو الموردين بالاسم أو الكود أو الهاتف",
    kind: "read",
    permission: { module: "sales", action: "read" },
    argsSchema: searchArgs,
  },
  // ── Mutating tools ────────────────────────────────────────────────────────
  {
    name: "create_customer",
    description: "Create a new customer (requires confirmation)",
    descriptionAr: "إنشاء عميل جديد (يتطلب تأكيداً)",
    kind: "mutating",
    permission: { module: "customers", action: "create" },
    argsSchema: createCustomerArgs,
  },
  {
    name: "create_product",
    description: "Create a new product (requires confirmation)",
    descriptionAr: "إنشاء منتج جديد (يتطلب تأكيداً)",
    kind: "mutating",
    permission: { module: "inventory", action: "create" },
    argsSchema: createProductArgs,
  },
  {
    name: "create_expense",
    description: "Create a new expense (requires confirmation)",
    descriptionAr: "إنشاء مصروف جديد (يتطلب تأكيداً)",
    kind: "mutating",
    permission: { module: "expenses", action: "create" },
    argsSchema: createExpenseArgs,
  },
  {
    name: "create_sale_draft",
    description: "Create a sale draft for review (requires confirmation)",
    descriptionAr: "إنشاء مسودة بيع للمراجعة (يتطلب تأكيداً)",
    kind: "mutating",
    permission: { module: "sales", action: "create" },
    argsSchema: createSaleDraftArgs,
  },
];

export function getToolByName(name: string): ToolDefinition | undefined {
  return TOOL_REGISTRY.find((t) => t.name === name);
}

import { z } from "zod";
import type {
  ApplicationAdapter,
  AppMetadata,
  AppCapabilities,
  AppNavItem,
  AppDashboardWidget,
  AppAITool,
  AppHealthStatus,
} from "../types";

/**
 * Grocery Application Adapter
 *
 * Integrates the existing Grocery Management System into Business OS.
 * Provides metadata, navigation, permissions, dashboard widgets, and AI tools
 * for the grocery domain.
 */
export class GroceryAdapter implements ApplicationAdapter {
  getMetadata(): AppMetadata {
    return {
      slug: "grocery",
      name: "Grocery Management",
      nameAr: "إدارة البقالة",
      nameEn: "Grocery Management",
      description: "Full-featured grocery store management with POS, inventory, purchasing, and sales tracking",
      descriptionAr: "نظام إدارة بقالة متكامل مع نقاط بيع وإدارة مخزون ومشتريات ومبيعات",
      icon: "shopping-cart",
      category: "business",
      version: "1.0.0",
      routePrefix: "/app/grocery",
      capabilities: {
        offlineSupported: true,
        syncSupported: true,
        barcodeSupported: true,
        printingSupported: true,
        cameraSupported: false,
      },
      permissions: [
        "grocery.products.view",
        "grocery.products.create",
        "grocery.products.edit",
        "grocery.products.delete",
        "grocery.inventory.view",
        "grocery.inventory.adjust",
        "grocery.sales.view",
        "grocery.sales.create",
        "grocery.sales.delete",
        "grocery.sales.refund",
        "grocery.purchases.view",
        "grocery.purchases.create",
        "grocery.purchases.edit",
        "grocery.purchases.delete",
        "grocery.customers.view",
        "grocery.customers.create",
        "grocery.customers.edit",
        "grocery.customers.delete",
        "grocery.suppliers.view",
        "grocery.suppliers.create",
        "grocery.suppliers.edit",
        "grocery.suppliers.delete",
        "grocery.expenses.view",
        "grocery.expenses.create",
        "grocery.expenses.edit",
        "grocery.expenses.delete",
        "grocery.reports.view",
        "grocery.pos.operate",
        "grocery.pos.refund",
        "grocery.settings.manage",
        "grocery.users.manage",
        "grocery.audit.view",
      ],
      navigation: this.getNavigation(),
    };
  }

  getCapabilities(): AppCapabilities {
    return {
      offlineSupported: true,
      syncSupported: true,
      barcodeSupported: true,
      printingSupported: true,
      cameraSupported: false,
    };
  }

  getNavigation(): AppNavItem[] {
    return [
      { name: "Dashboard", nameAr: "لوحة التحكم", href: "/app/grocery", icon: "layout-dashboard" },
      { name: "POS", nameAr: "نقطة البيع", href: "/app/grocery/pos", icon: "scan-barcode", permission: "grocery.pos.operate" },
      { name: "Products", nameAr: "المنتجات", href: "/app/grocery/products", icon: "package", permission: "grocery.products.view" },
      { name: "Categories", nameAr: "الأقسام", href: "/app/grocery/categories", icon: "tags", permission: "grocery.products.view" },
      { name: "Brands", nameAr: "العلامات التجارية", href: "/app/grocery/brands", icon: "award", permission: "grocery.products.view" },
      { name: "Inventory", nameAr: "المخزون", href: "/app/grocery/inventory", icon: "boxes", permission: "grocery.inventory.view" },
      { name: "Sales", nameAr: "المبيعات", href: "/app/grocery/sales", icon: "receipt-text", permission: "grocery.sales.view" },
      { name: "Purchases", nameAr: "المشتريات", href: "/app/grocery/purchases", icon: "shopping-basket", permission: "grocery.purchases.view" },
      { name: "Customers", nameAr: "العملاء", href: "/app/grocery/customers", icon: "users", permission: "grocery.customers.view" },
      { name: "Suppliers", nameAr: "الموردين", href: "/app/grocery/suppliers", icon: "truck", permission: "grocery.suppliers.view" },
      { name: "Expenses", nameAr: "المصروفات", href: "/app/grocery/expenses", icon: "wallet", permission: "grocery.expenses.view" },
      { name: "Reports", nameAr: "التقارير", href: "/app/grocery/reports", icon: "chart-line", permission: "grocery.reports.view" },
      { name: "Settings", nameAr: "الإعدادات", href: "/app/grocery/settings", icon: "settings", permission: "grocery.settings.manage" },
    ];
  }

  getPermissions(): string[] {
    return this.getMetadata().permissions;
  }

  getDashboardWidgets(): AppDashboardWidget[] {
    return [
      {
        id: "grocery-sales-today",
        type: "kpi",
        title: "Today's Sales",
        titleAr: "مبيعات اليوم",
        permission: "grocery.sales.view",
        config: { metric: "salesToday", format: "currency" },
        defaultPosition: { x: 0, y: 0, w: 1, h: 1 },
      },
      {
        id: "grocery-profit-today",
        type: "kpi",
        title: "Today's Profit",
        titleAr: "ربح اليوم",
        permission: "grocery.reports.view",
        config: { metric: "profitToday", format: "currency" },
        defaultPosition: { x: 1, y: 0, w: 1, h: 1 },
      },
      {
        id: "grocery-low-stock",
        type: "kpi",
        title: "Low Stock Items",
        titleAr: "منتجات منخفضة المخزون",
        permission: "grocery.inventory.view",
        config: { metric: "lowStockCount", format: "number" },
        defaultPosition: { x: 2, y: 0, w: 1, h: 1 },
      },
      {
        id: "grocery-customers-debt",
        type: "kpi",
        title: "Customer Debts",
        titleAr: "ديون العملاء",
        permission: "grocery.customers.view",
        config: { metric: "customerDebtTotal", format: "currency" },
        defaultPosition: { x: 3, y: 0, w: 1, h: 1 },
      },
      {
        id: "grocery-sales-chart",
        type: "chart",
        title: "Sales Trend",
        titleAr: "اتجاه المبيعات",
        permission: "grocery.reports.view",
        config: { chartType: "line", period: "7days", metric: "sales" },
        defaultPosition: { x: 0, y: 1, w: 2, h: 2 },
      },
      {
        id: "grocery-top-products",
        type: "table",
        title: "Top Products",
        titleAr: "المنتجات الأكثر مبيعاً",
        permission: "grocery.reports.view",
        config: { query: "topProducts", limit: 5, period: "30days" },
        defaultPosition: { x: 2, y: 1, w: 2, h: 2 },
      },
    ];
  }

  getAITools(): AppAITool[] {
    return [
      {
        name: "getGrocerySalesSummary",
        description: "Get sales summary for the grocery store (today, this week, this month)",
        descriptionAr: "ملخص المبيعات لمتجر البقالة",
        permission: "grocery.reports.view",
        parametersSchema: z.object({
          period: z.enum(["today", "week", "month", "year"]).default("today"),
        }),
        isMutating: false,
      },
      {
        name: "getGroceryInventoryStatus",
        description: "Check current inventory levels, low stock items, and expiring products",
        descriptionAr: "فحص مستويات المخزون والمنتجات منخفضة والقريبة من الانتهاء",
        permission: "grocery.inventory.view",
        parametersSchema: z.object({
          filter: z.enum(["all", "low_stock", "expiring", "out_of_stock"]).default("all"),
        }),
        isMutating: false,
      },
      {
        name: "getGroceryTopProducts",
        description: "Get the best-selling products in the grocery store",
        descriptionAr: "المنتجات الأكثر مبيعاً في متجر البقالة",
        permission: "grocery.reports.view",
        parametersSchema: z.object({
          period: z.enum(["week", "month", "quarter", "year"]).default("month"),
          limit: z.number().min(1).max(50).default(10),
        }),
        isMutating: false,
      },
      {
        name: "getGroceryCustomerDebts",
        description: "Get customer debt summary and overdue accounts",
        descriptionAr: "ملخص ديون العملاء والحسابات المتأخرة",
        permission: "grocery.customers.view",
        parametersSchema: z.object({
          includeZero: z.boolean().default(false),
        }),
        isMutating: false,
      },
      {
        name: "getGroceryPurchaseSummary",
        description: "Get purchase order summary and supplier payments",
        descriptionAr: "ملخص أوامر الشراء ودفعات الموردين",
        permission: "grocery.purchases.view",
        parametersSchema: z.object({
          period: z.enum(["week", "month", "quarter"]).default("month"),
        }),
        isMutating: false,
      },
      {
        name: "getGroceryExpenseSummary",
        description: "Get expense summary by category",
        descriptionAr: "ملخص المصروفات حسب التصنيف",
        permission: "grocery.expenses.view",
        parametersSchema: z.object({
          period: z.enum(["week", "month", "quarter"]).default("month"),
        }),
        isMutating: false,
      },
      {
        name: "createGroceryExpense",
        description: "Create a new expense record in the grocery system",
        descriptionAr: "إنشاء سجل مصروف جديد في نظام البقالة",
        permission: "grocery.expenses.create",
        parametersSchema: z.object({
          amount: z.number().positive(),
          categoryId: z.string(),
          description: z.string().optional(),
          note: z.string().optional(),
        }),
        isMutating: true,
      },
    ];
  }

  getSettingsSchema(): z.ZodType | null {
    return z.object({
      currency: z.string().default("YER"),
      taxRateBps: z.number().min(0).max(10000).default(0),
      priceIncludesTax: z.boolean().default(false),
      weightUnit: z.enum(["kg", "g", "lb", "oz"]).default("kg"),
      scaleBarcodesEnabled: z.boolean().default(false),
      receipt: z.object({
        widthMm: z.number().default(80),
        footerAr: z.string().optional(),
        footerEn: z.string().optional(),
        showBarcodeOnReceipt: z.boolean().default(true),
      }).optional(),
      loyalty: z.object({
        enabled: z.boolean().default(true),
        earnPerSpent: z.number().default(1),
        pointValue: z.number().default(1),
      }).optional(),
    });
  }

  async getHealthStatus(): Promise<AppHealthStatus> {
    // In production, this would check database connectivity, API health, etc.
    return {
      status: "healthy",
      message: "Grocery service is operational",
      lastChecked: new Date(),
    };
  }
}

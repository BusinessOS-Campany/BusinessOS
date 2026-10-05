import type { ModuleName } from "@/core/permissions/catalog";

export interface ModuleDef {
  name: ModuleName;
  href: string; // tenant-app route
  icon: string; // lucide icon name (mapped in shell)
}

/** Sidebar/nav registry — filtered by the org's enabled modules. */
export const MODULE_REGISTRY: ModuleDef[] = [
  { name: "pos", href: "/app/pos", icon: "scan-barcode" },
  { name: "sales", href: "/app/sales", icon: "receipt-text" },
  { name: "products", href: "/app/products", icon: "package" },
  { name: "inventory", href: "/app/inventory", icon: "boxes" },
  { name: "customers", href: "/app/customers", icon: "users" },
  { name: "suppliers", href: "/app/suppliers", icon: "truck" },
  { name: "purchases", href: "/app/purchases", icon: "shopping-basket" },
  { name: "expenses", href: "/app/expenses", icon: "wallet" },
  { name: "finance", href: "/app/finance", icon: "landmark" },
  { name: "reports", href: "/app/reports", icon: "chart-line" },
  { name: "workflows", href: "/app/workflows", icon: "workflow" },
  { name: "audit", href: "/app/audit", icon: "history" },
  { name: "settings", href: "/app/admin/modules", icon: "settings" },
  { name: "users", href: "/app/admin/users", icon: "user-cog" },
];

export const ADMIN_MODULES: ModuleName[] = ["settings", "users"];

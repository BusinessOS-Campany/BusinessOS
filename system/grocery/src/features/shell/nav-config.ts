import {
  LayoutDashboard, Package, FolderTree, Warehouse,
  CalendarClock, ShoppingCart, ReceiptText,
  Building2, FileText, PackageOpen, RotateCcw, UsersRound,
  CreditCard, LineChart, Wallet, UserCog, KeyRound, ScrollText, Settings2,
  Store, Globe2, ShieldCheck, DatabaseBackup, Snowflake, type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import type { Dictionary } from "@/shared/i18n";

export type NavLabelKey = keyof Dictionary["nav"] | keyof Dictionary["reports"];

export interface NavItem {
  href: string;
  labelKey: NavLabelKey;
  icon: LucideIcon;
  permission?: string;
}

export interface NavGroup {
  labelKey: keyof Dictionary["nav"] | null;
  icon?: LucideIcon;
  permission?: string;
  items: NavItem[];
}

/** Resolve a nav item label from either the nav or reports dictionary section. */
export function navLabel(nav: Dictionary["nav"], reports: Dictionary["reports"], key: NavLabelKey): string {
  const n = nav as Record<string, unknown>;
  const r = reports as Record<string, unknown>;
  const resolved = n[key] ?? r[key];
  return typeof resolved === "string" ? resolved : String(key);
}

/**
 * Tracks which nav row the pointer or keyboard focus is on.
 *
 * `<Link>` prefetches on viewport entry and on hover, and `prefetch={false}`
 * turns off both — there is no hover-only mode in the App Router, and
 * `router.prefetch()` does not help because the router discards a prefetched
 * entry for a link marked `prefetch={false}`. Holding `prefetch` off until the
 * row is actually aimed at gets Next's own prefetcher (the one whose entry the
 * click reads) to run at the moment of intent, and only for that one row.
 *
 * Measured on the org copy of this system through the platform proxy, leaving
 * prefetch on for the whole sidebar fired 41 RSC requests on one page load and
 * held the connection for ~6.5s past interactivity on a ~550ms link, so the
 * click the user actually made queued behind them.
 */
export function useNavIntent(): {
  /** The href currently under the pointer or focus, or null. */
  intent: string | null;
  enter: (href: string) => void;
  leave: (href: string) => void;
} {
  const [intent, setIntent] = useState<string | null>(null);
  return {
    intent,
    enter: setIntent,
    leave: (href: string) => setIntent((current) => (current === href ? null : current)),
  };
}

export const NAV_GROUPS: NavGroup[] = [
  { labelKey: null, items: [{ href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard, permission: "dashboard.view" }] },
  {
    labelKey: "inventory", icon: Package, permission: "products.view",
    items: [
      { href: "/inventory/products", labelKey: "products", icon: Package, permission: "products.view" },
      { href: "/inventory/categories", labelKey: "categories", icon: FolderTree, permission: "catalog.categories" },
      { href: "/inventory/stock", labelKey: "stock", icon: Warehouse, permission: "inventory.view" },
      { href: "/inventory/expiring", labelKey: "expiring", icon: CalendarClock, permission: "inventory.batches" },
    ],
  },
  {
    labelKey: "sales", icon: ShoppingCart, permission: "sales.view",
    items: [
      { href: "/sales/pos", labelKey: "pos", icon: ShoppingCart, permission: "sales.create" },
      { href: "/sales/orders", labelKey: "orders", icon: ReceiptText, permission: "sales.view" },
    ],
  },
  {
    labelKey: "procurement", icon: Building2, permission: "procurement.view",
    items: [
      { href: "/procurement/suppliers", labelKey: "suppliers", icon: Building2, permission: "suppliers.view" },
      { href: "/procurement/purchase-orders", labelKey: "purchaseOrders", icon: FileText, permission: "procurement.create" },
      { href: "/procurement/purchases", labelKey: "purchases", icon: PackageOpen, permission: "procurement.view" },
      { href: "/procurement/returns", labelKey: "purchaseReturns", icon: RotateCcw, permission: "procurement.return" },
    ],
  },
  {
    labelKey: "customers", icon: UsersRound, permission: "customers.view",
    items: [
      { href: "/customers/list", labelKey: "customersList", icon: UsersRound, permission: "customers.view" },
      { href: "/customers/frozen", labelKey: "frozenAccounts", icon: Snowflake, permission: "customers.view" },
      { href: "/customers/transactions", labelKey: "customerTransactions", icon: CreditCard, permission: "customers.credit" },
    ],
  },
  {
    labelKey: "reports", icon: LineChart, permission: "reports.view",
    items: [
      { href: "/reports/sales", labelKey: "salesReport", icon: LineChart, permission: "reports.view" },
      { href: "/reports/purchases", labelKey: "purchasesReport", icon: LineChart, permission: "reports.view" },
      { href: "/reports/profit", labelKey: "profitReport", icon: LineChart, permission: "reports.view" },
      { href: "/reports/inventory", labelKey: "inventoryReport", icon: Warehouse, permission: "reports.view" },
      { href: "/reports/customers", labelKey: "customersReport", icon: UsersRound, permission: "reports.view" },
      { href: "/reports/suppliers", labelKey: "suppliersReport", icon: Building2, permission: "reports.view" },
      { href: "/reports/expenses", labelKey: "expensesReport", icon: Wallet, permission: "reports.view" },
      { href: "/reports/summary", labelKey: "financialSummary", icon: LineChart, permission: "reports.view" },
    ],
  },
  { labelKey: null, items: [{ href: "/expenses", labelKey: "expenses", icon: Wallet, permission: "expenses.view" }] },
  {
    labelKey: "usersSection", icon: UserCog, permission: "users.view",
    items: [
      { href: "/users", labelKey: "users", icon: UserCog, permission: "users.view" },
      { href: "/roles", labelKey: "roles", icon: KeyRound, permission: "roles.manage" },
      { href: "/audit-log", labelKey: "auditLog", icon: ScrollText, permission: "audit.view" },
    ],
  },
  {
    labelKey: "settings", icon: Settings2, permission: "settings.view",
    items: [
      { href: "/settings/store", labelKey: "store", icon: Store, permission: "settings.view" },
      { href: "/settings/sales", labelKey: "sales", icon: ShoppingCart, permission: "settings.view" },
      { href: "/settings/inventory", labelKey: "inventory", icon: Warehouse, permission: "settings.view" },
      { href: "/settings/localization", labelKey: "localization", icon: Globe2, permission: "settings.view" },
      { href: "/settings/security", labelKey: "security", icon: ShieldCheck, permission: "settings.manage" },
      { href: "/settings/backup", labelKey: "backup", icon: DatabaseBackup, permission: "backup.manage" },
    ],
  },
];

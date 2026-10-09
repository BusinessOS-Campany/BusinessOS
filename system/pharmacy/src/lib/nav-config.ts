import type { Permission } from "@/lib/permissions";

export interface NavItem {
  labelKey: string;
  href: string;
  icon: string;
  permission?: Permission;
}

export interface NavGroup {
  labelKey: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: "nav.overview",
    items: [
      { labelKey: "nav.dashboard", href: "/dashboard", icon: "Home", permission: "dashboard:view" },
      { labelKey: "nav.pos", href: "/pos", icon: "ShoppingCart", permission: "pos:operate" },
    ],
  },
  {
    labelKey: "nav.inventoryGroup",
    items: [
      { labelKey: "nav.medicines", href: "/medicines", icon: "Pill", permission: "medicines:view" },
      { labelKey: "nav.batches", href: "/batches", icon: "Layers", permission: "batches:view" },
      { labelKey: "nav.inventory", href: "/inventory", icon: "Package", permission: "inventory:view" },
      { labelKey: "nav.expiry", href: "/inventory/expiring", icon: "Clock", permission: "inventory:view" },
    ],
  },
  {
    labelKey: "nav.salesGroup",
    items: [
      { labelKey: "nav.sales", href: "/sales", icon: "Receipt", permission: "sales:view" },
      { labelKey: "nav.returns", href: "/returns", icon: "Undo2", permission: "returns:view" },
      { labelKey: "nav.customers", href: "/customers", icon: "Users", permission: "customers:view" },
    ],
  },
  {
    labelKey: "nav.purchases",
    items: [
      { labelKey: "nav.purchases", href: "/purchases", icon: "ShoppingBag", permission: "purchases:view" },
      { labelKey: "nav.suppliers", href: "/suppliers", icon: "Truck", permission: "suppliers:view" },
    ],
  },
  {
    labelKey: "nav.peopleGroup",
    items: [
      { labelKey: "nav.prescriptions", href: "/prescriptions", icon: "FileText", permission: "prescriptions:view" },
      { labelKey: "nav.doctors", href: "/doctors", icon: "Stethoscope", permission: "doctors:view" },
      { labelKey: "nav.employees", href: "/employees", icon: "Contact", permission: "employees:view" },
    ],
  },
  {
    labelKey: "nav.financeGroup",
    items: [
      { labelKey: "nav.expenses", href: "/expenses", icon: "Wallet", permission: "expenses:view" },
      { labelKey: "nav.cash", href: "/cash", icon: "Banknote", permission: "cash:view" },
      { labelKey: "nav.accounting", href: "/accounting", icon: "Calculator", permission: "accounting:view" },
    ],
  },
  {
    labelKey: "nav.admin",
    items: [
      { labelKey: "nav.reports", href: "/reports", icon: "BarChart3", permission: "reports:view" },
      { labelKey: "nav.roles", href: "/roles", icon: "Shield", permission: "roles:view" },
      { labelKey: "nav.settings", href: "/settings", icon: "Settings", permission: "settings:view" },
      { labelKey: "nav.audit", href: "/audit", icon: "FileClock", permission: "audit:view" },
    ],
  },
];
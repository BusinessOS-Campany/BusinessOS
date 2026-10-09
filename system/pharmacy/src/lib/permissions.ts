// Pharmacy roles & permission system — `module:action` strings.
// Server-side enforcement (API routes + DAL guards) — never rely on UI alone.

export type RoleKey =
  | "OWNER"
  | "ADMIN"
  | "PHARMACIST"
  | "CASHIER"
  | "INVENTORY_MANAGER"
  | "ACCOUNTANT";

export const MODULES = [
  "dashboard",
  "medicines",
  "batches",
  "inventory",
  "sales",
  "returns",
  "purchases",
  "suppliers",
  "customers",
  "prescriptions",
  "doctors",
  "employees",
  "expenses",
  "cash",
  "accounting",
  "reports",
  "roles",
  "settings",
  "notifications",
  "audit",
  "search",
] as const;

export const ACTIONS = [
  "view",
  "create",
  "edit",
  "delete",
  "export",
  "print",
  "approve",
  "refund",
  "discount",
  "receive",
  "adjust",
  "transfer",
  "manage",
] as const;

export type Permission =
  | `${(typeof MODULES)[number]}:${(typeof ACTIONS)[number]}`
  | "pos:operate";

const P = (m: (typeof MODULES)[number], ...a: (typeof ACTIONS)[number][]) =>
  a.map((act) => `${m}:${act}` as Permission);

export const ROLE_DEFINITIONS: Record<
  RoleKey,
  { name: string; nameAr: string; permissions: Permission[] }
> = {
  OWNER: {
    name: "Owner",
    nameAr: "المالك",
    permissions: (() => {
      const all: Permission[] = [];
      for (const m of MODULES)
        all.push(...(ACTIONS.map((a) => `${m}:${a}`) as Permission[]));
      all.push("pos:operate");
      return all;
    })(),
  },
  ADMIN: {
    name: "Administrator",
    nameAr: "مدير النظام",
    permissions: [
      ...P("dashboard", "view"),
      ...P("medicines", "view", "create", "edit", "export", "print"),
      ...P("batches", "view", "create", "edit", "print"),
      ...P("inventory", "view", "adjust", "transfer", "export", "print"),
      ...P("sales", "view", "create", "edit", "refund", "discount", "print"),
      ...P("returns", "view", "create", "edit", "approve"),
      ...P("purchases", "view", "create", "edit", "receive", "export", "print"),
      ...P("suppliers", "view", "create", "edit", "export"),
      ...P("customers", "view", "create", "edit", "export"),
      ...P("prescriptions", "view", "create", "edit", "print"),
      ...P("doctors", "view", "create", "edit"),
      ...P("employees", "view", "create", "edit"),
      ...P("expenses", "view", "create", "edit", "approve"),
      ...P("cash", "view", "manage"),
      ...P("accounting", "view", "manage"),
      ...P("reports", "view", "export", "print"),
      ...P("roles", "view", "manage"),
      ...P("settings", "view", "manage"),
      ...P("notifications", "view"),
      ...P("audit", "view"),
      ...P("search", "view"),
      "pos:operate",
    ],
  },
  PHARMACIST: {
    name: "Pharmacist",
    nameAr: "صيدلي",
    permissions: [
      ...P("dashboard", "view"),
      ...P("medicines", "view", "create", "edit", "export", "print"),
      ...P("batches", "view", "create", "print"),
      ...P("inventory", "view", "adjust", "export"),
      ...P("sales", "view", "create", "refund", "discount", "print"),
      ...P("returns", "view", "create"),
      ...P("purchases", "view", "create", "receive", "print"),
      ...P("suppliers", "view", "create", "edit"),
      ...P("customers", "view", "create", "edit"),
      ...P("prescriptions", "view", "create", "edit", "print"),
      ...P("doctors", "view", "create", "edit"),
      ...P("employees", "view"),
      ...P("reports", "view", "export", "print"),
      ...P("notifications", "view"),
      ...P("search", "view"),
      "pos:operate",
    ],
  },
  CASHIER: {
    name: "Cashier",
    nameAr: "كاشير",
    permissions: [
      ...P("dashboard", "view"),
      ...P("medicines", "view", "print"),
      ...P("inventory", "view"),
      ...P("sales", "view", "create", "discount", "print", "refund"),
      ...P("returns", "view", "create"),
      ...P("customers", "view", "create"),
      ...P("prescriptions", "view"),
      ...P("cash", "view"),
      ...P("search", "view"),
      "pos:operate",
    ],
  },
  INVENTORY_MANAGER: {
    name: "Inventory Manager",
    nameAr: "مدير المخزون",
    permissions: [
      ...P("dashboard", "view"),
      ...P("medicines", "view", "create", "edit", "export", "print"),
      ...P("batches", "view", "create", "edit", "print"),
      ...P("inventory", "view", "adjust", "transfer", "export", "print"),
      ...P("purchases", "view", "create", "receive", "print"),
      ...P("suppliers", "view", "create", "edit"),
      ...P("returns", "view", "create"),
      ...P("reports", "view", "export", "print"),
      ...P("notifications", "view"),
      ...P("search", "view"),
    ],
  },
  ACCOUNTANT: {
    name: "Accountant",
    nameAr: "محاسب",
    permissions: [
      ...P("dashboard", "view"),
      ...P("medicines", "view"),
      ...P("inventory", "view"),
      ...P("sales", "view", "refund"),
      ...P("purchases", "view"),
      ...P("suppliers", "view", "export"),
      ...P("customers", "view", "export"),
      ...P("expenses", "view", "create", "edit", "approve"),
      ...P("cash", "view", "manage"),
      ...P("accounting", "view", "manage"),
      ...P("reports", "view", "export", "print"),
      ...P("audit", "view"),
      ...P("notifications", "view"),
      ...P("search", "view"),
    ],
  },
};

export const ALL_ROLE_KEYS = Object.keys(ROLE_DEFINITIONS) as RoleKey[];

export const ROLE_NAME: Record<RoleKey, string> = {
  OWNER: "Owner",
  ADMIN: "Administrator",
  PHARMACIST: "Pharmacist",
  CASHIER: "Cashier",
  INVENTORY_MANAGER: "Inventory Manager",
  ACCOUNTANT: "Accountant",
};

export const ROLE_NAME_AR: Record<RoleKey, string> = {
  OWNER: "المالك",
  ADMIN: "مدير النظام",
  PHARMACIST: "صيدلي",
  CASHIER: "كاشير",
  INVENTORY_MANAGER: "مدير المخزون",
  ACCOUNTANT: "محاسب",
};

export function isRoleKey(role: string): role is RoleKey {
  return role in ROLE_DEFINITIONS;
}

export function permissionsFor(role: string): Permission[] {
  if (isRoleKey(role)) return ROLE_DEFINITIONS[role].permissions;
  return [];
}

export function hasPermission(
  role: string,
  permission: Permission
): boolean {
  return permissionsFor(role).includes(permission);
}
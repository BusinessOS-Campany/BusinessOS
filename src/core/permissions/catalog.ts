import { createAccessControl } from "better-auth/plugins/access";

/**
 * Permission grammar: `<module>.<action>` (+ optional scope via branch
 * assignments in M4). The catalog is CODE — auditable and versioned.
 * Role→permission maps below are the platform defaults every new org gets;
 * M3 will allow admins to compose custom roles on top of these statements.
 */
export const modules = {
  products: ["read", "create", "update", "delete"],
  inventory: ["read", "adjust", "transfer", "count"],
  sales: ["read", "create", "update", "delete", "refund", "discount"],
  purchases: ["read", "create", "update", "delete", "receive"],
  customers: ["read", "create", "update", "delete"],
  suppliers: ["read", "create", "update", "delete"],
  expenses: ["read", "create", "update", "delete", "approve"],
  finance: ["read", "manage"],
  employees: ["read", "create", "update", "delete"],
  /**
   * Clinical records. Added deliberately: before these existed there was no
   * permission statement that could describe "read a patient", so every SAMA
   * route was left with membership as its only check and any `viewer` member
   * could read and write the entire clinical dataset.
   */
  patients: ["read", "create", "update", "delete"],
  /** Appointments plus the therapy sessions, calendar and coverage around them. */
  appointments: ["read", "create", "update", "delete", "cancel"],
  reports: ["read"],
  pos: ["operate", "refund", "discount"],
  settings: ["read", "manage"],
  custom_fields: ["read", "create", "update", "delete"],
  users: ["read", "invite", "update", "remove"],
  roles: ["read", "manage"],
  audit: ["read"],
  workflows: ["read", "manage"],
  ai: ["use", "configure"],
  integrations: ["read", "manage", "export", "delete"],
  systems: ["read", "install", "manage"],
} as const;

export type ModuleName = keyof typeof modules;

export const ac = createAccessControl(modules);

type Grant<K extends ModuleName> = readonly (typeof modules)[K][number][];

/** A permission check request: module → required action(s). */
export type PermissionStatement = { [K in ModuleName]?: Grant<K> };

/** Preserves literal action types without littering `as const` everywhere. */
function grants<const S extends { [K in ModuleName]?: Grant<K> }>(s: S) {
  return s;
}

/** Full control incl. org-level administration. */
export const ownerRole = ac.newRole(grants({ ...modules }));

/** Everything except role management and ownership transfer. */
export const adminRole = ac.newRole(
  grants({
    ...modules,
    roles: ["read"] as Grant<"roles">,
  }),
);

/** Day-to-day operations without destructive finance actions. */
export const managerRole = ac.newRole(
  grants({
    products: ["read", "create", "update"],
    inventory: ["read", "adjust", "transfer", "count"],
    sales: ["read", "create", "update", "refund", "discount"],
    purchases: ["read", "create", "update", "receive"],
    customers: ["read", "create", "update"],
    suppliers: ["read", "create", "update"],
    expenses: ["read", "create", "update", "approve"],
    finance: ["read"],
    employees: ["read"],
    // Clinical day-to-day without destructive deletes.
    patients: ["read", "create", "update"] as Grant<"patients">,
    appointments: ["read", "create", "update", "cancel"] as Grant<"appointments">,
    reports: ["read"],
    pos: ["operate", "refund", "discount"],
    settings: ["read"],
    custom_fields: ["read", "create", "update"] as Grant<"custom_fields">,
    users: ["read"],
    audit: ["read"],
    workflows: ["read"],
    ai: ["use"],
    systems: ["read", "install"] as Grant<"systems">,
  }),
);

/** POS + sales focus. */
export const cashierRole = ac.newRole(
  grants({
    products: ["read"],
    inventory: ["read"],
    sales: ["read", "create"],
    customers: ["read", "create", "update"],
    // Booking a visit is a front-desk job; reading the clinical record is not.
    appointments: ["read", "create"] as Grant<"appointments">,
    pos: ["operate"],
  }),
);

/** Accounting focus. */
export const accountantRole = ac.newRole(
  grants({
    products: ["read"],
    inventory: ["read"],
    sales: ["read", "refund"],
    purchases: ["read"],
    customers: ["read"],
    suppliers: ["read"],
    expenses: ["read", "create", "update", "approve"],
    finance: ["read", "manage"],
    reports: ["read"],
    settings: ["read"],
    audit: ["read"],
    workflows: ["read"],
    ai: ["use"],
    integrations: ["read", "manage", "export"] as Grant<"integrations">,
  }),
);

/** Read-only across operational data. */
export const viewerRole = ac.newRole(
  grants({
    products: ["read"],
    inventory: ["read"],
    sales: ["read"],
    purchases: ["read"],
    customers: ["read"],
    suppliers: ["read"],
    expenses: ["read"],
    finance: ["read"],
    employees: ["read"],
    // Read-only clinical visibility, but no writes of any kind.
    patients: ["read"] as Grant<"patients">,
    appointments: ["read"] as Grant<"appointments">,
    reports: ["read"],
    integrations: ["read"] as Grant<"integrations">,
  }),
);

export const tenantRoles = {
  owner: ownerRole,
  admin: adminRole,
  manager: managerRole,
  cashier: cashierRole,
  accountant: accountantRole,
  viewer: viewerRole,
} as const;

export type TenantRole = keyof typeof tenantRoles;

export const TENANT_ROLE_NAMES = Object.keys(tenantRoles) as TenantRole[];

export function isTenantRole(role: string): role is TenantRole {
  return role in tenantRoles;
}

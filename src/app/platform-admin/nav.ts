export interface PlatformAdminNavItem {
  href: string;
  icon: string;
  labelKey: string;
}

export const PLATFORM_ADMIN_NAV: PlatformAdminNavItem[] = [
  { href: "/platform-admin", icon: "overview", labelKey: "overview" },
  { href: "/platform-admin/approvals", icon: "approvals", labelKey: "approvals" },
  { href: "/platform-admin/tenants", icon: "tenants", labelKey: "tenants" },
  { href: "/platform-admin/plans", icon: "plans", labelKey: "plans" },
  { href: "/platform-admin/announcements", icon: "announcements", labelKey: "announcements" },
  { href: "/platform-admin/systems", icon: "systems", labelKey: "systems" },
];
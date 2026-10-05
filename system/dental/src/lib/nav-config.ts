import type { Permission } from "@/lib/permissions"

export interface NavItem {
  labelKey: string
  href: string
  icon: string
  permission?: Permission
}

export interface NavGroup {
  labelKey: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: "nav.overview",
    items: [
      { labelKey: "nav.dashboard", href: "/dashboard", icon: "Home", permission: "dashboard:view" },
    ],
  },
  {
    labelKey: "nav.clinic",
    items: [
      { labelKey: "nav.patients", href: "/patients", icon: "Users", permission: "patients:view" },
      { labelKey: "nav.appointments", href: "/appointments", icon: "CalendarDays", permission: "appointments:view" },
      { labelKey: "nav.waitingRoom", href: "/waiting-room", icon: "Clock", permission: "waitingRoom:view" },
      { labelKey: "nav.dentalChart", href: "/dental-chart", icon: "Smile", permission: "dentalChart:view" },
      { labelKey: "nav.prescriptions", href: "/prescriptions", icon: "FileText", permission: "prescriptions:view" },
      { labelKey: "nav.treatmentPlans", href: "/treatment-plans", icon: "ClipboardList", permission: "treatmentPlans:view" },
      { labelKey: "nav.imaging", href: "/imaging", icon: "Image", permission: "imaging:view" },
    ],
  },
  {
    labelKey: "nav.billingGroup",
    items: [
      { labelKey: "nav.invoices", href: "/invoices", icon: "FileText", permission: "invoices:view" },
      { labelKey: "nav.payments", href: "/payments", icon: "CreditCard", permission: "payments:view" },
      { labelKey: "nav.installments", href: "/installments", icon: "CalendarClock", permission: "installments:view" },
      { labelKey: "nav.expenses", href: "/expenses", icon: "Receipt", permission: "expenses:view" },
    ],
  },
  {
    labelKey: "nav.inventoryGroup",
    items: [
      { labelKey: "nav.inventory", href: "/inventory", icon: "Package", permission: "inventory:view" },
      { labelKey: "nav.suppliers", href: "/suppliers", icon: "Truck", permission: "suppliers:view" },
      { labelKey: "nav.laboratory", href: "/laboratory", icon: "FlaskConical", permission: "laboratory:view" },
    ],
  },
  {
    labelKey: "nav.admin",
    items: [
      { labelKey: "nav.staff", href: "/staff", icon: "UserCog", permission: "staff:view" },
      { labelKey: "nav.dentists", href: "/dentists", icon: "Stethoscope", permission: "dentists:view" },
      { labelKey: "nav.reports", href: "/reports", icon: "BarChart3", permission: "reports:view" },
      { labelKey: "nav.settings", href: "/settings", icon: "Settings", permission: "settings:view" },
      { labelKey: "nav.auditLog", href: "/audit-log", icon: "Shield", permission: "audit:view" },
    ],
  },
]

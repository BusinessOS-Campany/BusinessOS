import {
  Activity,
  Award,
  Boxes,
  Calendar,
  CalendarCheck,
  ChartLine,
  ClipboardList,
  GraduationCap,
  HeartPulse,
  LayoutDashboard,
  Package,
  Puzzle,
  Receipt,
  ReceiptText,
  ScanBarcode,
  Settings,
  ShoppingBasket,
  ShoppingCart,
  Stethoscope,
  Store,
  Tags,
  Truck,
  UserCog,
  Users,
  Utensils,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/**
 * Icon names are stored in the database as kebab-case strings, so they have to
 * be resolved to components before they can be rendered.
 *
 * This is not hypothetical: the `apps` table currently holds "shopping-cart"
 * and "heart-pulse", and every platform template and app adapter keys its nav
 * by the same convention. Rendering `system.icon` directly therefore prints the
 * literal word "shopping-cart" where an icon was meant to be.
 *
 * Both spellings appear in the codebase - the templates and adapters use a mix
 * of kebab-case and PascalCase keys - so both are registered here.
 */
const ICONS: Record<string, LucideIcon> = {
  activity: Activity,
  award: Award,
  boxes: Boxes,
  calendar: Calendar,
  "calendar-check": CalendarCheck,
  "chart-line": ChartLine,
  "clipboard-list": ClipboardList,
  "graduation-cap": GraduationCap,
  "heart-pulse": HeartPulse,
  "layout-dashboard": LayoutDashboard,
  package: Package,
  receipt: Receipt,
  "receipt-text": ReceiptText,
  "scan-barcode": ScanBarcode,
  settings: Settings,
  "shopping-basket": ShoppingBasket,
  "shopping-cart": ShoppingCart,
  stethoscope: Stethoscope,
  store: Store,
  tags: Tags,
  truck: Truck,
  "user-cog": UserCog,
  users: Users,
  utensils: Utensils,
  wallet: Wallet,
};

/** PascalCase aliases, matching the keys used by the templates and adapters. */
const ALIASES: Record<string, LucideIcon> = {
  Activity: ICONS.activity,
  Award: ICONS.award,
  Boxes: ICONS.boxes,
  Calendar: ICONS.calendar,
  CalendarCheck: ICONS["calendar-check"],
  ChartLine: ICONS["chart-line"],
  ClipboardList: ICONS["clipboard-list"],
  GraduationCap: ICONS["graduation-cap"],
  HeartPulse: ICONS["heart-pulse"],
  LayoutDashboard: ICONS["layout-dashboard"],
  Package: ICONS.package,
  Receipt: ICONS.receipt,
  ReceiptText: ICONS["receipt-text"],
  ScanBarcode: ICONS["scan-barcode"],
  Settings: ICONS.settings,
  ShoppingBasket: ICONS["shopping-basket"],
  ShoppingCart: ICONS["shopping-cart"],
  Stethoscope: ICONS.stethoscope,
  Store: ICONS.store,
  Tags: ICONS.tags,
  Truck: ICONS.truck,
  UserCog: ICONS["user-cog"],
  Users: ICONS.users,
  Utensils: ICONS.utensils,
  Wallet: ICONS.wallet,
};

/**
 * Resolves a stored icon name to a component, falling back to `Puzzle` - the
 * vector counterpart of the puzzle-piece emoji this field used to default to.
 *
 * Never returns undefined: callers render `<Icon className=... />` directly, and
 * an undefined component makes React throw "Element type is invalid", which is
 * what an unmapped name in a sidebar would otherwise do.
 */
export function appIcon(name: string | null | undefined): LucideIcon {
  if (!name) return Puzzle;
  return ICONS[name] ?? ALIASES[name] ?? Puzzle;
}

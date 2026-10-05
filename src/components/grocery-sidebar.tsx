"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@radix-ui/react-tooltip";
import { SignOutButton } from "@/components/sign-out-button";
import {
  LayoutDashboard,
  ScanBarcode,
  Package,
  Tags,
  Award,
  Boxes,
  ReceiptText,
  ShoppingBasket,
  Users,
  Truck,
  Wallet,
  ChartLine,
  Settings,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import type { Locale } from "@/core/i18n/dictionaries";

const ICON_MAP: Record<string, LucideIcon> = {
  "layout-dashboard": LayoutDashboard,
  "scan-barcode": ScanBarcode,
  "package": Package,
  "tags": Tags,
  "award": Award,
  "boxes": Boxes,
  "receipt-text": ReceiptText,
  "shopping-basket": ShoppingBasket,
  "users": Users,
  "truck": Truck,
  "wallet": Wallet,
  "chart-line": ChartLine,
  "settings": Settings,
};

export interface GroceryNavItem {
  name: string;
  nameAr?: string;
  href: string;
  icon: string;
  label: string;
  permission?: string;
}

export interface GrocerySidebarProps {
  navItems: GroceryNavItem[];
  user: { name: string; email: string };
  branding?: {
    primary?: string;
    logoUrl?: string;
    displayNameOverride?: string;
  };
  locale: Locale;
  dir: "rtl" | "ltr";
}

export function GrocerySidebar({
  navItems,
  user,
  branding,
  locale,
  dir,
}: GrocerySidebarProps) {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/app/grocery") return pathname === "/app/grocery";
    return pathname.startsWith(href);
  }

  return (
    <TooltipProvider delayDuration={300}>
      <aside
        className={cn(
          "hidden md:fixed md:inset-y-0 md:flex md:w-64 md:flex-col",
          "bg-sidebar text-sidebar-foreground",
          dir === "rtl" ? "md:right-0" : "md:left-0"
        )}
        style={{
          borderRight: dir === "rtl" ? undefined : "1px solid var(--sidebar-border)",
          borderLeft: dir === "rtl" ? "1px solid var(--sidebar-border)" : undefined,
        }}
      >
        {/* Brand */}
        <div
          className="flex h-16 shrink-0 items-center gap-3 px-5"
          style={{ borderBottom: "1px solid var(--sidebar-border)" }}
        >
          <Link
            href="/my-apps"
            className="flex items-center gap-2.5 min-w-0"
          >
            {branding?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={branding.logoUrl}
                alt=""
                className="h-8 w-8 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <span
                className="inline-block h-8 w-8 shrink-0 rounded-lg"
                style={{ background: "var(--brand-primary, #03EABC)" }}
              />
            )}
            <span className="truncate text-sm font-semibold text-sidebar-foreground">
              {branding?.displayNameOverride || "البقالة"}
            </span>
          </Link>
        </div>

        <nav
          className="flex-1 overflow-y-auto px-3 py-4"
          aria-label="Grocery navigation"
        >
          {/* Back to My Apps — always visible at top */}
          <ul className="space-y-0.5 mb-2">
            <li>
              <Link
                href="/my-apps"
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  pathname === "/my-apps"
                    ? "bg-sidebar-accent text-sidebar-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                <ArrowRight className="h-5 w-5 shrink-0 rotate-180" />
                <span className="truncate">تطبيقاتي</span>
              </Link>
            </li>
          </ul>
          <div className="mx-3 mb-2 border-t border-sidebar-border" />

          {/* Grocery nav items */}
          <ul className="space-y-0.5">
            {navItems.map((item) => {
              const Icon = ICON_MAP[item.icon];
              const active = isActive(item.href);
              return (
                <li key={item.name}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        href={item.href}
                        className={cn(
                          "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                          active
                            ? "text-primary-foreground"
                            : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
                        )}
                        style={
                          active
                            ? {
                                background: "var(--brand-primary, #03EABC)",
                                borderRadius: "var(--brand-radius, 8px)",
                              }
                            : undefined
                        }
                        aria-current={active ? "page" : undefined}
                      >
                        {Icon && (
                          <Icon
                            className={cn(
                              "h-5 w-5 shrink-0",
                              active
                                ? "text-primary-foreground"
                                : "text-muted-foreground group-hover:text-sidebar-foreground"
                            )}
                          />
                        )}
                        <span className="truncate">{item.label}</span>
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent
                      side={dir === "rtl" ? "right" : "left"}
                      sideOffset={8}
                      className="md:hidden"
                    >
                      {item.label}
                    </TooltipContent>
                  </Tooltip>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Bottom section */}
        <div
          className="shrink-0 px-3 pb-4"
          style={{ borderTop: "1px solid var(--sidebar-border)" }}
        >
          <div className="flex items-center gap-3 px-3 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground">
              {user.name?.charAt(0)?.toUpperCase() || "?"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-sidebar-foreground">
                {user.name}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {user.email}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3">
            <div className="flex-1">
              <LocaleSwitcher current={locale} />
            </div>
            <ThemeToggle />
            <SignOutButton
              label="تسجيل الخروج"
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
            />
          </div>
        </div>
      </aside>

      <div className="h-0 md:hidden" />
    </TooltipProvider>
  );
}

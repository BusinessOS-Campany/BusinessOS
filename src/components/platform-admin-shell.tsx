"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardCheck,
  Building2,
  CreditCard,
  Megaphone,
  ExternalLink,
  ShieldCheck,
  AppWindow,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PLATFORM_ADMIN_NAV } from "@/app/platform-admin/nav";
import { SignOutButton } from "@/app/platform-admin/sign-out-button";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { t, type Dictionary, type Locale } from "@/core/i18n/dictionaries";

const ICONS: Record<string, LucideIcon> = {
  overview: LayoutDashboard,
  approvals: ClipboardCheck,
  tenants: Building2,
  plans: CreditCard,
  announcements: Megaphone,
  systems: AppWindow,
};

const NAV_IDLE =
  "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-neutral-400 dark:hover:bg-white/5 dark:hover:text-white";
const NAV_ICON_IDLE =
  "text-slate-400 group-hover:text-slate-600 dark:text-neutral-500 dark:group-hover:text-neutral-200";
const MUTED = "text-slate-500 dark:text-neutral-400";
const FAINT = "text-slate-400 dark:text-neutral-500";
const HAIRLINE = "border-slate-200 dark:border-neutral-800";

export interface PlatformAdminShellProps {
  pendingApprovals: number;
  user: { name: string; email: string };
  appUrl: string;
  locale: Locale;
  dir: "rtl" | "ltr";
  dict: Dictionary;
  children: React.ReactNode;
}

export function PlatformAdminShell({
  pendingApprovals,
  user,
  appUrl,
  locale,
  dir,
  dict,
  children,
}: PlatformAdminShellProps) {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/platform-admin") return pathname === "/platform-admin";
    return pathname.startsWith(href);
  }

  const active = PLATFORM_ADMIN_NAV.find((n) => isActive(n.href));

  return (
    <div dir={dir} className="min-h-screen bg-slate-100 text-slate-900 dark:bg-neutral-950 dark:text-neutral-100">
      {/* Mobile top bar + nav */}
      <header className={cn("sticky top-0 z-30 border-b bg-white/95 backdrop-blur md:hidden", HAIRLINE, "dark:bg-neutral-900")}>
        <div className="flex items-center justify-between px-4 py-3">
          <Link href="/platform-admin" className="flex items-center gap-2">
            <span className="inline-block h-7 w-7 rounded-lg bg-primary" />
            <span className="text-sm font-semibold">Business OS</span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <SignOutButton label={t(dict, "common.signOut")} />
          </div>
        </div>
        <nav className={cn("border-t", HAIRLINE)} aria-label={t(dict, "platform.manage")}>
          <ul className="flex items-center gap-1 overflow-x-auto px-3 py-2 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {PLATFORM_ADMIN_NAV.map((item) => {
              const Icon = ICONS[item.icon] ?? LayoutDashboard;
              const activeItem = isActive(item.href);
              return (
                <li key={item.href} className="shrink-0">
                  <Link
                    href={item.href}
                    aria-current={activeItem ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      activeItem ? "bg-primary/15 text-primary" : NAV_IDLE,
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{t(dict, `platform.nav.${item.labelKey}`)}</span>
                    {item.href === "/platform-admin/approvals" && pendingApprovals > 0 && (
                      <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                        {pendingApprovals}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 z-40 hidden w-64 flex-col border-slate-200 bg-white md:flex dark:border-neutral-800 dark:bg-neutral-900",
          dir === "rtl" ? "right-0 border-l" : "left-0 border-r",
        )}
      >
        {/* Brand */}
        <div className={cn("flex h-16 shrink-0 items-center gap-3 border-b px-5", HAIRLINE)}>
          <span className="inline-block h-8 w-8 shrink-0 rounded-lg bg-primary" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">Business OS</p>
            <p className={cn("text-xs", MUTED)}>{t(dict, "platform.subtitle")}</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label={t(dict, "platform.manage")}>
          <p className={cn("px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider", FAINT)}>
            {t(dict, "platform.manage")}
          </p>
          <ul className="space-y-1">
            {PLATFORM_ADMIN_NAV.map((item) => {
              const Icon = ICONS[item.icon] ?? LayoutDashboard;
              const activeItem = isActive(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={activeItem ? "page" : undefined}
                    className={cn(
                      "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      activeItem ? "bg-primary/15 text-primary" : NAV_IDLE,
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-5 w-5 shrink-0",
                        activeItem ? "text-primary" : NAV_ICON_IDLE,
                      )}
                    />
                    <span className="flex-1 truncate">
                      {t(dict, `platform.nav.${item.labelKey}`)}
                    </span>
                    {item.href === "/platform-admin/approvals" && pendingApprovals > 0 && (
                      <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                        {pendingApprovals}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className={cn("mx-3 my-4 border-t", HAIRLINE)} />

          <p className={cn("px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider", FAINT)}>
            {t(dict, "platform.general")}
          </p>
          <ul className="space-y-1">
            <li>
              <a
                href={appUrl}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  NAV_IDLE,
                )}
              >
                <ExternalLink className={cn("h-5 w-5 shrink-0", NAV_ICON_IDLE)} />
                <span className="truncate">{t(dict, "platform.viewLiveSite")}</span>
              </a>
            </li>
          </ul>
        </nav>

        {/* Footer */}
        <div className={cn("shrink-0 border-t p-3", HAIRLINE)}>
          <LocaleSwitcher current={locale} />
          <div className="mt-3 flex items-center gap-3">
            <Link
              href="/profile"
              title={t(dict, "platform.viewProfile")}
              aria-label={t(dict, "platform.viewProfile")}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/20 text-sm font-semibold text-primary ring-2 ring-transparent transition hover:ring-primary/50"
            >
              {user.name?.charAt(0)?.toUpperCase() || "A"}
            </Link>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user.name}</p>
              <p className={cn("truncate text-xs", FAINT)}>{user.email}</p>
            </div>
            <SignOutButton label={t(dict, "common.signOut")} />
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className={dir === "rtl" ? "md:mr-64" : "md:ml-64"}>
        <header className={cn("sticky top-0 z-30 hidden items-center justify-between border-b bg-white/80 px-8 py-3 backdrop-blur md:flex", HAIRLINE, "dark:bg-neutral-950/80")}>
          <div className="flex items-center gap-2 text-sm">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <span className={MUTED}>{t(dict, "platform.platform")}</span>
            <span className="text-slate-300 dark:text-neutral-600">/</span>
            <span className="font-medium">
              {active ? t(dict, `platform.nav.${active.labelKey}`) : t(dict, "platform.subtitle")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <a
              href={appUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-500 hover:border-slate-300 hover:text-slate-900 dark:border-neutral-800 dark:text-neutral-400 dark:hover:border-neutral-600 dark:hover:text-white"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t(dict, "platform.liveSite")}
            </a>
            <span className={cn("text-xs", MUTED)}>{user.email}</span>
          </div>
        </header>

        <main className="px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}

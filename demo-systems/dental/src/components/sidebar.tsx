"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Home, Users, CalendarDays, Clock, Smile, FileText, Image, ClipboardList,
  CreditCard, CalendarClock, Receipt, Package, Truck, FlaskConical,
  UserCog, Stethoscope, BarChart3, Settings, Shield, LogOut,
  ChevronsLeft, ChevronsRight,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { useI18n } from "@/components/lang-provider"
import type { Dictionary } from "@/lib/i18n"
import { NAV_GROUPS, type NavItem } from "@/lib/nav-config"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Sheet,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetContent,
} from "@/components/ui/sheet"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { logoutAction } from "@/lib/actions/auth"
import type { CurrentUser } from "@/lib/dal"

const ICONS: Record<string, LucideIcon> = {
  Home, Users, CalendarDays, Clock, Smile, FileText, Image, ClipboardList,
  CreditCard, CalendarClock, Receipt, Package, Truck, FlaskConical,
  UserCog, Stethoscope, BarChart3, Settings, Shield,
}

const initials = (name: string) =>
  name.split(/\s+/).slice(0, 2).map((p) => p.charAt(0)).join("").toUpperCase()

function groupLabel(key: string, t: Dictionary): string {
  const k = key.replace("nav.", "") as keyof Dictionary["nav"]
  return t.nav[k]
}

function NavLink({ item, collapsed, onLinkClick }: { item: NavItem; collapsed: boolean; onLinkClick?: () => void }) {
  const { t, locale } = useI18n()
  const pathname = usePathname()
  const Icon: LucideIcon = ICONS[item.icon] ?? FileText
  const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
  const label = t.nav[item.labelKey.replace("nav.", "") as keyof Dictionary["nav"]]

  const link = (
    <Link
      href={item.href}
      onClick={onLinkClick}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        "hover:bg-accent hover:text-accent-foreground",
        isActive ? "bg-primary/10 text-primary" : "text-muted-foreground",
        collapsed && "justify-center px-2"
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", isActive && "text-primary")} />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  )

  if (!collapsed) return <div key={item.href}>{link}</div>

  return (
    <Tooltip delayDuration={100}>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side={locale === "ar" ? "left" : "right"} sideOffset={10}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

function SidebarBody({
  user,
  collapsed,
  onLinkClick,
}: {
  user: CurrentUser
  collapsed: boolean
  onLinkClick?: () => void
}) {
  const { t, locale } = useI18n()
  const displayName = locale === "ar" && user.nameAr ? user.nameAr : user.name

  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) =>
      item.permission ? user.permissions.includes(item.permission) : true
    ),
  })).filter((g) => g.items.length > 0)

  return (
    <TooltipProvider delayDuration={100}>
      <div className="flex h-full flex-col">
      <div className={cn("flex items-center gap-2 border-b px-4 py-4", collapsed && "justify-center px-2")}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary font-bold text-sm text-primary-foreground">
          DA
        </div>
        {!collapsed && (
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-bold leading-tight">Dar Al-Asnan</span>
            <span className="truncate text-[10px] leading-tight text-muted-foreground">
              {locale === "ar" ? t.app.clinicNameAr : t.app.clinicName}
            </span>
          </div>
        )}
      </div>

      <ScrollArea className="flex-1 py-3">
        <nav className={cn("space-y-5", collapsed && "space-y-3")}>
          {visibleGroups.map((group) => (
            <div key={group.labelKey}>
              {!collapsed && (
                <p className="mb-1 px-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {groupLabel(group.labelKey, t)}
                </p>
              )}
              <div className={cn("space-y-0.5", collapsed && "px-1")}>
                {group.items.map((item) => (
                  <NavLink key={item.href} item={item} collapsed={collapsed} onLinkClick={onLinkClick} />
                ))}
              </div>
            </div>
          ))}
        </nav>
      </ScrollArea>

      <Separator />
      <div className={cn("p-3", collapsed && "p-2")}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors hover:bg-accent",
                collapsed && "justify-center px-1"
              )}
            >
              <Avatar className="h-7 w-7">
                <AvatarFallback className="text-[10px]">{initials(user.name)}</AvatarFallback>
              </Avatar>
              {!collapsed && (
                <div className="flex min-w-0 flex-1 flex-col items-start">
                  <span className="max-w-full truncate text-xs font-medium">{displayName}</span>
                  <span className="max-w-full truncate text-[10px] text-muted-foreground" dir="ltr">
                    {user.email}
                  </span>
                </div>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => logoutAction()}>
              <LogOut className="h-4 w-4" />
              {t.auth.signOut}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      </div>
    </TooltipProvider>
  )
}

export function DesktopSidebar({ user }: { user: CurrentUser }) {
  const [collapsed, setCollapsed] = useState(false)
  const { locale } = useI18n()

  return (
    <aside
      className={cn(
        "relative hidden shrink-0 border-e bg-muted/30 transition-[width] duration-300 md:block",
        collapsed ? "w-[72px]" : "w-[260px]"
      )}
    >
      <div className="flex h-full flex-col">
        <SidebarBody user={user} collapsed={collapsed} />
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="absolute -end-3 top-7 z-10 flex h-6 w-6 items-center justify-center rounded-full border bg-background shadow-sm transition-colors hover:bg-accent"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronsRight className={cn("h-3.5 w-3.5", locale === "ar" && "rotate-180")} />
          ) : (
            <ChevronsLeft className={cn("h-3.5 w-3.5", locale === "ar" && "rotate-180")} />
          )}
        </button>
      </div>
    </aside>
  )
}

export function MobileSidebar({
  user,
  open,
  onOpenChange,
}: {
  user: CurrentUser
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <button className="sr-only" />
      </SheetTrigger>
      <SheetContent side="left" className="w-[280px] p-0">
        <SheetHeader className="sr-only">
          <SheetTitle>Navigation</SheetTitle>
        </SheetHeader>
        <SidebarBody user={user} collapsed={false} onLinkClick={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  )
}
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Menu, LogOut, User, Search, Bell } from "lucide-react"
import { useI18n } from "@/components/lang-provider"
import { LanguageSwitch } from "@/components/language-switch"
import { ThemeToggle } from "@/components/theme-toggle"
import { DesktopSidebar, MobileSidebar } from "@/components/sidebar"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import { logoutAction } from "@/lib/actions/auth"
import type { CurrentUser } from "@/lib/dal"

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0))
    .join("")
    .toUpperCase()

export function AppShell({
  user,
  children,
}: {
  user: CurrentUser
  children: React.ReactNode
}) {
  const { t, locale } = useI18n()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)

  const displayName = locale === "ar" && user.nameAr ? user.nameAr : user.name

  return (
    <div className="flex min-h-svh w-full">
      <MobileSidebar user={user} open={mobileOpen} onOpenChange={setMobileOpen} />
      <DesktopSidebar user={user} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-6">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
            <span className="sr-only">{t.nav.menu}</span>
          </Button>

          <div className="relative hidden sm:block">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder={t.app.searchPlaceholder}
              className="h-9 w-64 rounded-full ps-9"
            />
          </div>

          <div className="ms-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              <span className="sr-only">{t.app.notifications}</span>
              <span className="absolute end-2 top-2 h-2 w-2 rounded-full bg-destructive" />
            </Button>
            <Separator orientation="vertical" className="mx-1 hidden h-6 sm:block" />
            <LanguageSwitch size="md" />
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="ms-1 rounded-full ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>{initials(user.name)}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium">{displayName}</span>
                    <span className="text-xs text-muted-foreground" dir="ltr">
                      {user.email}
                    </span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push("/settings")} disabled>
                  <User className="h-4 w-4" /> {t.nav.profile}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => logoutAction()}
                >
                  <LogOut className="h-4 w-4" /> {t.auth.signOut}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
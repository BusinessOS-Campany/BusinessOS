"use client";

import { usePathname } from "next/navigation";
import { useLocale } from "@/components/providers";
import { Sidebar, type SidebarSlot } from "@/components/sidebar";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { cn } from "@/lib/utils";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlobalSearch } from "@/components/search/global-search";
import { useState } from "react";

export function AppShell({
  children,
  items,
  userName,
  userRoleAr,
  notifications,
}: {
  children: React.ReactNode;
  items: SidebarSlot;
  userName: string;
  userRoleAr: string;
  notifications?: number;
}) {
  const { dir } = useLocale();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="min-h-screen">
      <Sidebar items={items} notifications={notifications} />

      <div className={cn("flex min-h-screen flex-col md:pl-64", dir === "rtl" && "md:pl-0 md:pr-64")}>
        <header className="no-print sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur sm:gap-3">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setSidebarOpen(!sidebarOpen)}>
            <Menu className="h-5 w-5" />
          </Button>
<GlobalSearch />
          <div className="ms-auto flex items-center gap-1">
            <LocaleSwitcher />
            <ThemeToggle />
            <UserMenu userName={userName} userRoleAr={userRoleAr} />
          </div>
        </header>

        {sidebarOpen ? (
          <div className="fixed inset-0 z-40 md:hidden" onClick={() => setSidebarOpen(false)}>
            <div className="absolute inset-0 bg-black/50" />
            <div className="absolute inset-y-0 start-0 w-64">
              <Sidebar items={items} notifications={notifications} />
            </div>
          </div>
        ) : null}

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
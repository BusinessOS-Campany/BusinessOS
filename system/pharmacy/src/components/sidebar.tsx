"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { getIcon } from "@/lib/icons";
import { Badge } from "@/components/ui/badge";
import { Milestone } from "lucide-react";
import { useLocale } from "@/components/providers";

export type SidebarSlot = Array<{
  label: string;
  key: string;
  items: Array<{ labelKey: string; href: string; icon: string; label: string }>;
}>;

export function Sidebar({ items, notifications }: { items: SidebarSlot; notifications?: number }) {
  const pathname = usePathname();
  const { dir } = useLocale();

  return (
    <aside className={cn("no-print fixed inset-y-0 z-40 hidden w-64 flex-col border-r bg-card md:flex", dir === "rtl" && "border-l border-r-0")}>
      <div className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Milestone className="h-4 w-4" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-bold">Pharmacy</p>
          <p className="text-[11px] text-muted-foreground">نظام إدارة الصيدلية</p>
        </div>
      </div>
      <nav className="scroll-thin flex-1 space-y-4 overflow-y-auto p-3">
        {items.map((group) => (
          <div key={group.key}>
            <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = getIcon(item.icon);
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-colors",
                        active
                          ? "bg-primary/10 font-medium text-foreground"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground"
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.href === "/notifications" && notifications ? (
                        <Badge variant="destructive" className="h-5 min-w-5 px-1 text-[10px]">
                          {notifications}
                        </Badge>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
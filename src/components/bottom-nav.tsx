"use client";

import { usePathname } from "next/navigation";
import { NavLink } from "@/components/nav-link";

const NAV_ITEMS = [
  { label: "Home", labelAr: "الرئيسية", href: "/app", icon: "⌂" },
  { label: "Sales", labelAr: "المبيعات", href: "/app/sales", icon: "💰" },
  { label: "Inventory", labelAr: "المخزون", href: "/app/inventory", icon: "📦" },
  { label: "Customers", labelAr: "العملاء", href: "/app/customers", icon: "👥" },
  { label: "More", labelAr: "المزيد", href: "/app/settings", icon: "☰" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-50 border-t border-border bg-background md:hidden"
      role="navigation"
      aria-label="Mobile navigation"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex items-center justify-around h-14">
        {NAV_ITEMS.map((item) => {
          const active = item.href === "/app"
            ? pathname === "/app"
            : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <NavLink
                href={item.href}
                className={`flex flex-col items-center justify-center h-14 px-2 min-w-[44px] min-h-[44px] text-[10px] leading-tight transition-colors ${
                  active
                    ? "text-primary font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                aria-current={active ? "page" : undefined}
              >
                <span className="text-xl leading-none" aria-hidden="true">{item.icon}</span>
                <span className="mt-0.5">{item.labelAr}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Users,
  Truck,
  ReceiptText,
  ShoppingBasket,
  Boxes,
  ScanBarcode,
  ChartLine,
  Workflow,
  History,
  Search,
  CornerDownLeft,
  ArrowUp,
  ArrowDown,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Shortcut {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  icon: LucideIcon;
  group: string;
}

const SHORTCUTS: Shortcut[] = [
  { id: "dashboard", title: "Dashboard", subtitle: "Overview & analytics", href: "/app", icon: LayoutDashboard, group: "Navigation" },
  { id: "products", title: "Products", subtitle: "Manage your products", href: "/app/products", icon: Package, group: "Modules" },
  { id: "customers", title: "Customers", subtitle: "Customer directory", href: "/app/customers", icon: Users, group: "Modules" },
  { id: "suppliers", title: "Suppliers", subtitle: "Supplier management", href: "/app/suppliers", icon: Truck, group: "Modules" },
  { id: "sales", title: "Sales", subtitle: "Sales orders & invoices", href: "/app/sales", icon: ReceiptText, group: "Modules" },
  { id: "purchases", title: "Purchases", subtitle: "Purchase orders", href: "/app/purchases", icon: ShoppingBasket, group: "Modules" },
  { id: "inventory", title: "Inventory", subtitle: "Stock & warehouse", href: "/app/inventory", icon: Boxes, group: "Modules" },
  { id: "pos", title: "POS", subtitle: "Point of sale", href: "/app/pos", icon: ScanBarcode, group: "Modules" },
  { id: "reports", title: "Reports", subtitle: "Analytics & reports", href: "/app/reports", icon: ChartLine, group: "Modules" },
  { id: "workflows", title: "Workflows", subtitle: "Automation rules", href: "/app/workflows", icon: Workflow, group: "Tools" },
  { id: "audit", title: "Audit", subtitle: "Activity history", href: "/app/audit", icon: History, group: "Tools" },
];

interface SearchResult {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  icon: string;
  group: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function debounce<T extends (...args: any[]) => any>(fn: T, ms: number) {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function groupBy<T>(items: T[], key: (item: T) => string): Record<string, T[]> {
  return items.reduce((acc, item) => {
    const k = key(item);
    (acc[k] = acc[k] || []).push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Shortcut[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const isMac = typeof navigator !== "undefined" && navigator.platform?.startsWith("Mac");

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const fetchResults = useCallback(
    debounce(async (q: string) => {
      if (!q.trim()) {
        setResults([]);
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`/api/v1/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setResults(
          (data.results || []).map((r: SearchResult) => ({
            ...r,
            icon: r.icon || "Search",
            group: r.group || "Results",
          }))
        );
      } catch {
        setResults([]);
      }
      setLoading(false);
    }, 300),
    []
  );

  useEffect(() => {
    if (query.trim()) {
      setLoading(true);
      fetchResults(query);
    } else {
      setResults([]);
      setLoading(false);
    }
  }, [query, fetchResults]);

  const filteredShortcuts = query.trim()
    ? SHORTCUTS.filter(
        (s) =>
          s.title.toLowerCase().includes(query.toLowerCase()) ||
          s.subtitle.toLowerCase().includes(query.toLowerCase())
      )
    : SHORTCUTS;

  const allResults = query.trim()
    ? [
        ...filteredShortcuts,
        ...results.filter((r) => !filteredShortcuts.some((s) => s.id === r.id)),
      ]
    : SHORTCUTS;

  const grouped = groupBy(allResults, (r) => r.group);
  const flatList = allResults;

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    const el = itemRefs.current.get(activeIndex);
    if (el) {
      el.scrollIntoView({ block: "nearest" });
      el.focus();
    }
  }, [activeIndex]);

  function handleSelect(href: string) {
    setOpen(false);
    router.push(href);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, flatList.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && flatList[activeIndex]) {
      handleSelect(flatList[activeIndex].href);
    } else if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) {
        setActiveIndex((prev) => (prev <= 0 ? flatList.length - 1 : prev - 1));
      } else {
        setActiveIndex((prev) => (prev >= flatList.length - 1 ? 0 : prev + 1));
      }
    }
  }

  function getIcon(iconName: string) {
    const map: Record<string, LucideIcon> = {
      LayoutDashboard,
      Package,
      Users,
      Truck,
      ReceiptText,
      ShoppingBasket,
      Boxes,
      ScanBarcode,
      ChartLine,
      Workflow,
      History,
      Search,
    };
    return map[iconName] || Search;
  }

  let itemIndex = -1;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        )}
        aria-label="Open command palette"
      >
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline">Search...</span>
        <kbd className="pointer-events-none hidden select-none rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline">
          {isMac ? "⌘" : "Ctrl+"}K
        </kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
        >
          <div
            className="fixed inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          <div
            className={cn(
              "relative z-50 flex w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
            )}
            onKeyDown={handleKeyDown}
          >
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search or jump to..."
                className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
              {query && (
                <button
                  onClick={() => {
                    setQuery("");
                    inputRef.current?.focus();
                  }}
                  className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <kbd
                onClick={() => setOpen(false)}
                className="cursor-pointer rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
              >
                Esc
              </kbd>
            </div>

            <div ref={listRef} className="max-h-80 overflow-y-auto p-2">
              {loading && (
                <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                  Searching...
                </div>
              )}

              {!loading && flatList.length === 0 && query.trim() && (
                <div className="flex flex-col items-center justify-center py-6 text-sm text-muted-foreground">
                  <Search className="mb-2 h-8 w-8 opacity-50" />
                  No results found for &quot;{query}&quot;
                </div>
              )}

              {!loading &&
                Object.entries(grouped).map(([group, items]) => (
                  <div key={group} className="mb-2">
                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                      {group}
                    </div>
                    {items.map((item) => {
                      itemIndex++;
                      const currentIndex = itemIndex;
                      const Icon = typeof item.icon === "string" ? getIcon(item.icon) : item.icon;
                      const isActive = currentIndex === activeIndex;
                      return (
                        <div
                          key={item.id}
                          ref={(el) => {
                            if (el) itemRefs.current.set(currentIndex, el);
                          }}
                          tabIndex={isActive ? 0 : -1}
                          role="option"
                          aria-selected={isActive}
                          onClick={() => handleSelect(item.href)}
                          onMouseEnter={() => setActiveIndex(currentIndex)}
                          className={cn(
                            "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors outline-none",
                            isActive
                              ? "bg-accent text-foreground"
                              : "text-muted-foreground hover:bg-accent/50"
                          )}
                        >
                          <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-foreground">
                              {item.title}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {item.subtitle}
                            </div>
                          </div>
                          {isActive && (
                            <kbd className="flex items-center gap-1 rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              <CornerDownLeft className="h-3 w-3" />
                            </kbd>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
            </div>

            <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <ArrowUp className="h-3 w-3" />
                <ArrowDown className="h-3 w-3" />
                to navigate
              </span>
              <span className="flex items-center gap-1">
                <CornerDownLeft className="h-3 w-3" />
                to select
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-border bg-muted px-1 py-0.5">Tab</kbd>
                to cycle
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

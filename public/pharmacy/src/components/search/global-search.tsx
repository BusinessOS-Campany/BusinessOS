"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { translateKey } from "@/lib/client-i18n";
import { useLocale } from "@/components/providers";
import type { SearchGroup } from "@/lib/search-types";

export function GlobalSearch() {
  const { locale } = useLocale();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setGroups([]);
      setLoading(false);
      setOpen(false);
      return;
    }
    setLoading(true);
    setOpen(true);
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/pharmacy/api/search?q=${encodeURIComponent(q)}`);
        if (!res.ok) throw new Error("search failed");
        const data = (await res.json()) as { groups: SearchGroup[] };
        setGroups(data.groups ?? []);
      } catch {
        setGroups([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    function onDoc(e: MouseEvent | TouchEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
    };
  }, []);

  const total = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <div ref={boxRef} className="relative hidden w-full max-w-md sm:block">
      <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        className="ps-9"
        placeholder={translateKey(locale, "common.searchPlaceholder")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => query.trim() && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && query.trim()) {
            router.push(`/search?q=${encodeURIComponent(query.trim())}`);
          }
          if (e.key === "Escape") setOpen(false);
        }}
      />
      {open ? (
        <div className="absolute start-0 end-0 top-full z-50 mt-1 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg">
          {loading ? (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {translateKey(locale, "common.searching")}
            </div>
          ) : total === 0 ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">{translateKey(locale, "common.noResults")}</div>
          ) : (
            <div className="max-h-[70vh] overflow-y-auto p-1.5">
              {groups.map((g) => (
                <div key={g.title} className="py-1">
                  <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.title}</p>
                  {g.items.map((item) => (
                    <Link
                      key={item.id}
                      href={g.hrefPrefix}
                      onClick={() => setOpen(false)}
                      className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted"
                    >
                      <span className="truncate font-medium">{item.label}</span>
                      {item.sub ? <span className="truncate text-muted-foreground">{item.sub}</span> : null}
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
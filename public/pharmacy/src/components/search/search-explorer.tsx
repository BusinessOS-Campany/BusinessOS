"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { translateKey } from "@/lib/client-i18n";
import { useLocale } from "@/components/providers";
import type { SearchGroup } from "@/lib/search-types";

export function SearchExplorer({
  initialQuery,
  initialGroups,
}: {
  initialQuery: string;
  initialGroups: SearchGroup[];
}) {
  const { locale } = useLocale();
  const [query, setQuery] = useState(initialQuery);
  const [groups, setGroups] = useState<SearchGroup[]>(initialGroups);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q === initialQuery.trim()) {
      setGroups(initialGroups);
      setLoading(false);
      return;
    }
    if (!q) {
      setGroups([]);
      setLoading(false);
      return;
    }
    setLoading(true);
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

  return (
    <div className="space-y-4">
      <div className="relative max-w-xl">
        <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="ps-9 py-5 text-base"
          placeholder={locale === "ar" ? "اكتب للبحث..." : "Type to search..."}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        {loading ? <Loader2 className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" /> : null}
      </div>

      {!query.trim() ? (
        <p className="text-sm text-muted-foreground">{locale === "ar" ? "ابدأ بالكتابة للبحث في النظام." : "Start typing to search the system."}</p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">{translateKey(locale, "common.searching")}</p>
      ) : groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">{translateKey(locale, "common.noResults")}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {groups.map((g) => (
            <Card key={g.title}>
              <CardHeader>
                <CardTitle className="text-base">{g.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {g.items.map((item) => (
                  <Link
                    key={item.id}
                    href={g.hrefPrefix}
                    className="flex items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors hover:bg-muted"
                  >
                    <span className="font-medium">{item.label}</span>
                    {item.sub ? <span className="text-muted-foreground">{item.sub}</span> : null}
                  </Link>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
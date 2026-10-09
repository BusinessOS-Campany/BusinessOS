"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Bell, CheckCheck, Search } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { translateKey } from "@/lib/client-i18n";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { markNotificationRead } from "@/lib/actions/account";

type Row = { id: string; title: string; body: string; href: string | null; isRead: boolean; createdAt: string };

export function NotificationsClient({ locale, rows }: { locale: Locale; rows: Row[] }) {
  const t = (k: string) => translateKey(locale, k);
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"all" | "unread">("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (tab === "unread" && r.isRead) return false;
      if (q && !r.title.toLowerCase().includes(q) && !r.body.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, tab, query]);

  const unread = rows.filter((r) => !r.isRead).length;

  function markRead(id: string) {
    startTransition(async () => {
      await markNotificationRead(id);
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={locale === "ar" ? "الإشعارات" : "Notifications"}
        description={locale === "ar" ? `${rows.length} إشعار — ${unread} غير مقروء` : `${rows.length} notifications — ${unread} unread`}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          <Button size="sm" variant={tab === "all" ? "default" : "ghost"} onClick={() => setTab("all")}>{locale === "ar" ? "الكل" : "All"}</Button>
          <Button size="sm" variant={tab === "unread" ? "default" : "ghost"} onClick={() => setTab("unread")}>{locale === "ar" ? "غير المقروءة" : "Unread"}</Button>
        </div>
        <div className="relative max-w-sm">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="ps-9" placeholder={t("common.searchPlaceholder")} value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Bell} title={locale === "ar" ? "لا توجد إشعارات" : "No notifications"} />
      ) : (
        <div className="space-y-2">
          {filtered.map((n) => {
            const inner = (
              <div className={`flex items-start justify-between gap-3 rounded-lg border p-4 transition-colors ${n.isRead ? "" : "bg-muted/30"}`}>
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    {!n.isRead && <span className="h-2 w-2 rounded-full bg-primary" />}
                    <span className="font-medium">{n.title}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{n.body}</p>
                  <p className="text-xs text-muted-foreground">{new Date(n.createdAt).toLocaleString(locale === "ar" ? "ar-YE" : "en-GB")}</p>
                </div>
                {!n.isRead && (
                  <Button size="sm" variant="ghost" onClick={(e) => { e.preventDefault(); e.stopPropagation(); markRead(n.id); }} disabled={pending}>
                    <CheckCheck /> {locale === "ar" ? "تحديد كمقروء" : "Mark read"}
                  </Button>
                )}
              </div>
            );
            return n.href ? <Link key={n.id} href={n.href}>{inner}</Link> : <div key={n.id}>{inner}</div>;
          })}
        </div>
      )}
    </div>
  );
}
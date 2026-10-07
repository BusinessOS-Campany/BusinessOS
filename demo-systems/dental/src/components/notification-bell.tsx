"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Bell } from "lucide-react"
import { useI18n } from "@/components/lang-provider"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { markAllNotificationsReadAction } from "@/lib/actions/notifications"
import type { NotificationDTO } from "@/lib/notifications"

/**
 * The header bell, reading the `Notification` rows the layout already loaded.
 *
 * The dot used to be a hardcoded `bg-destructive` span in `app-shell.tsx`: red
 * for a user with nothing unread, and inert for a user with a hundred. The
 * count here is `unreadCount` from the server, and it only ever shows when
 * there is genuinely something unread.
 *
 * Marking read is optimistic on purpose. `useState` only reads its initialiser on
 * mount, so the fresh props the action's `revalidatePath` sends down are never
 * re-seeded into this component: updating local state is what actually clears the
 * badge. The trade-off is that a notification created by someone else while this
 * page stays open is not picked up until the next load - recorded in
 * PROJECT_MAP.md rather than papered over here.
 */
export function NotificationBell({
  notifications,
  unreadCount,
}: {
  notifications: NotificationDTO[]
  unreadCount: number
}) {
  const { t, locale } = useI18n()
  const [items, setItems] = useState(notifications)
  const [unread, setUnread] = useState(unreadCount)
  const [pending, startTransition] = useTransition()

  const pick = (row: NotificationDTO, field: "title" | "body") =>
    locale === "ar" ? row[`${field}Ar`] ?? row[field] : row[field]

  function markAllRead() {
    startTransition(async () => {
      await markAllNotificationsReadAction()
      setItems((current) => current.map((row) => ({ ...row, isRead: true })))
      setUnread(0)
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          <span className="sr-only">{t.app.notifications}</span>
          {unread > 0 && (
            <span className="absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <DropdownMenuLabel className="flex items-center justify-between px-3 py-2">
          <span>{t.app.notifications}</span>
          {unread > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              disabled={pending}
              className="text-xs font-normal text-primary underline-offset-2 hover:underline disabled:opacity-50"
            >
              {t.app.markAllRead}
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="my-0" />
        {items.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            {t.app.noNotifications}
          </p>
        ) : (
          <ScrollArea className="max-h-80">
            {items.map((row) => {
              const body = pick(row, "body")
              const content = (
                <div className="flex flex-col gap-0.5 text-start">
                  <span className={row.isRead ? "text-sm" : "text-sm font-medium"}>
                    {pick(row, "title")}
                  </span>
                  {body && <span className="text-xs text-muted-foreground">{body}</span>}
                </div>
              )
              return row.link ? (
                <DropdownMenuItem key={row.id} asChild className="items-start py-2">
                  <Link href={row.link} onClick={markAllRead}>
                    {content}
                  </Link>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem key={row.id} onClick={markAllRead} className="items-start py-2">
                  {content}
                </DropdownMenuItem>
              )
            })}
          </ScrollArea>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
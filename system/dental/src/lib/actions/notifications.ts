"use server"

import { revalidatePath } from "next/cache"
import { requireAuth } from "@/lib/dal"
import { prisma } from "@/lib/prisma"
import { markNotificationsRead } from "@/lib/notifications"

/**
 * Marks the caller's unread notifications read.
 *
 * Scoped to `user.id` by construction: `markNotificationsRead` builds its own
 * `where`, so there is no caller-supplied filter to widen. The `(app)` layout
 * re-reads the bell's data, which is what refreshes the count.
 */
export async function markAllNotificationsReadAction(): Promise<{ ok: boolean; count: number }> {
  const user = await requireAuth()
  const count = await markNotificationsRead(prisma, user.id)
  revalidatePath("/", "layout")
  return { ok: true, count }
}
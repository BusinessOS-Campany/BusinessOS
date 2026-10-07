import { requireAuth } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { countUnreadNotifications, listNotifications } from "@/lib/notifications";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuth();

  // Loaded here rather than in the client: the bell used to be a hardcoded red
  // dot, so this is the first read of `Notification` in the app. Both queries are
  // scoped to `user.id` and hit `@@index([userId])`.
  const [notifications, unreadCount] = await Promise.all([
    listNotifications(prisma, user.id),
    countUnreadNotifications(prisma, user.id),
  ]);

  return (
    <AppShell user={user} notifications={notifications} unreadCount={unreadCount}>
      {children}
    </AppShell>
  );
}
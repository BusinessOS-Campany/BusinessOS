import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentUser } from "@/features/auth/session";
import { getT } from "@/shared/i18n";
import { getStoreSettings, getSystemSettings } from "@/features/settings/service";
import { appearanceStyleSheet, resolveAppearanceTokens } from "@/features/settings/appearance";
import { Sidebar } from "@/features/shell/sidebar";
import { Topbar } from "@/features/shell/topbar";
import { syncNotifications } from "@/features/notifications/service";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Defer to a real request so the build's prerender pass never opens DB
  // connections — they saturate Supabase's session-mode pooler (max 15).
  await connection();
  const user = await getCurrentUser();
  // Route through /api/auth/expire so a stale-but-signed cookie gets cleared
  // instead of ping-ponging with the proxy's login redirect.
  if (!user) redirect("/api/auth/expire?next=%2Flogin");
  if (user.mustChangePassword) redirect("/change-password");

  // Independent reads run concurrently — this is the hottest path in the app.
  const { t } = await getT();
  const [store, notificationRows, system] = await Promise.all([
    getStoreSettings(),
    syncNotifications(),
    getSystemSettings(),
  ]);
  // Org appearance overrides land after globals.css, so they win on specificity
  // ties. Empty string => globals.css defaults stay authoritative.
  const appearanceCss = appearanceStyleSheet(resolveAppearanceTokens(system));
  const notifications = notificationRows.map((n) => ({
    id: n.id, type: n.type, body: n.body ?? "", href: n.href,
    isRead: n.isRead, createdAt: n.createdAt.toISOString(),
  }));
  const aiVoice = Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN);

  return (
    <>
      {appearanceCss ? (
        <style dangerouslySetInnerHTML={{ __html: appearanceCss }} />
      ) : null}
      <div className="flex min-h-screen">
        <Sidebar
          t={t}
          permissions={user.permissions}
          storeName={store?.nameAr ?? store?.name ?? t.auth.storeName}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            t={t}
            userName={user.fullNameAr ?? user.fullName}
            roleName={user.roleName}
            permissions={user.permissions}
            notifications={notifications}
            storeName={store?.nameAr ?? store?.name ?? t.auth.storeName}
            aiVoice={aiVoice}
          />
          <main className="flex-1 p-4 md:p-6">{children}</main>
        </div>
      </div>
    </>
  );
}


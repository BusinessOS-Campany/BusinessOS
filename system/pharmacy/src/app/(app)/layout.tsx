import { cookies } from "next/headers";
import { requireAuth } from "@/lib/dal";
import { navForUser } from "@/lib/nav";
import { AppShell } from "@/components/app-shell";
import { LANG_COOKIE, localeFrom } from "@/lib/i18n";
import { ROLE_NAME_AR } from "@/lib/permissions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuth();
  const cookieStore = await cookies();
  const locale = localeFrom(cookieStore.get(LANG_COOKIE)?.value);
  const items = navForUser(user, locale);
  const roleAr =
    (user.role as keyof typeof ROLE_NAME_AR) in ROLE_NAME_AR
      ? ROLE_NAME_AR[user.role as keyof typeof ROLE_NAME_AR]
      : user.role;

  return (
    <AppShell items={items} userName={user.name} userRoleAr={roleAr}>
      {children}
    </AppShell>
  );
}
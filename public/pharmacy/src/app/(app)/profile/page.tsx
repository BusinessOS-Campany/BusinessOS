import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/dal";
import { LANG_COOKIE, localeFrom } from "@/lib/i18n";
import { redirect } from "next/navigation";
import { ProfileClient } from "@/components/profile/profile-client";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const cookieStore = await cookies();
  const locale = localeFrom(cookieStore.get(LANG_COOKIE)?.value);
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <ProfileClient
      locale={locale}
      user={{
        username: user.username,
        name: user.name,
        nameAr: user.nameAr ?? "",
        email: user.email,
        phone: user.phone ?? "",
        role: user.role,
      }}
    />
  );
}
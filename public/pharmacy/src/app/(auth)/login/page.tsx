import { cookies } from "next/headers";
import { LoginForm } from "@/components/auth/login-form";
import { LANG_COOKIE, localeFrom } from "@/lib/i18n";

export default async function LoginPage() {
  const cookieStore = await cookies();
  const locale = localeFrom(cookieStore.get(LANG_COOKIE)?.value);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <LoginForm locale={locale} />
    </div>
  );
}
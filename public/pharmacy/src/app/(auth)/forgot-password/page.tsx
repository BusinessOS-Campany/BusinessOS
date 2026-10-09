import { cookies } from "next/headers";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { LANG_COOKIE, localeFrom } from "@/lib/i18n";

export default async function ForgotPasswordPage() {
  const cookieStore = await cookies();
  const locale = localeFrom(cookieStore.get(LANG_COOKIE)?.value);
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <ForgotPasswordForm locale={locale} />
    </div>
  );
}
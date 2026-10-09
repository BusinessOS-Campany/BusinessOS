import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { LANG_COOKIE, localeFrom } from "@/lib/i18n";

export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token) notFound();
  const cookieStore = await cookies();
  const locale = localeFrom(cookieStore.get(LANG_COOKIE)?.value);
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <ResetPasswordForm locale={locale} token={token} />
    </div>
  );
}
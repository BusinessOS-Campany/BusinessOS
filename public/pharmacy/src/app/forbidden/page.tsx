import { cookies } from "next/headers";
import { translate } from "@/lib/i18n";
import { LANG_COOKIE, localeFrom } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";

export default async function ForbiddenPage() {
  const cookieStore = await cookies();
  const locale = localeFrom(cookieStore.get(LANG_COOKIE)?.value);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4 text-center">
      <div className="rounded-full bg-destructive/10 p-5">
        <ShieldAlert className="h-10 w-10 text-destructive" />
      </div>
      <h1 className="text-2xl font-bold">{translate(locale, "auth.unauthorized")}</h1>
      <p className="text-sm text-muted-foreground">
        {locale === "ar" ? "انتقل إلى لوحة التحكم للاستمرار." : "Head back to the dashboard to continue."}
      </p>
      <Button asChild>
        <a href="/pharmacy/dashboard">{translate(locale, "nav.dashboard")}</a>
      </Button>
    </div>
  );
}
"use client";

import { useRouter } from "next/navigation";
import { LOCALE_COOKIE, LOCALES, type Locale } from "@/core/i18n/dictionaries";

export function LocaleSwitcher({ current }: { current: Locale }) {
  const router = useRouter();
  return (
    <select
      value={current}
      onChange={(e) => {
        const v = e.target.value as Locale;
        document.cookie = `${LOCALE_COOKIE}=${v}; path=/; max-age=31536000; samesite=lax`;
        router.refresh();
      }}
      className="h-8 w-full rounded-lg border border-border bg-secondary px-2 text-xs text-secondary-foreground transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
      aria-label="Language"
    >
      {LOCALES.map((l) => (
        <option key={l} value={l}>
          {l === "ar" ? "العربية" : "English"}
        </option>
      ))}
    </select>
  );
}

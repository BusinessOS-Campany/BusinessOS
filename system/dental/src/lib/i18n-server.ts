import { cookies } from "next/headers"
import { dictionary, dirByLocale, LANG_COOKIE, localeFrom, type Dictionary, type Locale } from "@/lib/i18n"

export async function getI18n(): Promise<{ locale: Locale; dir: "ltr" | "rtl"; t: Dictionary }> {
  const cookieStore = await cookies()
  const locale = localeFrom(cookieStore.get(LANG_COOKIE)?.value)
  return { locale, dir: dirByLocale[locale], t: dictionary[locale] }
}
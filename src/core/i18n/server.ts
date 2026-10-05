import { cookies } from "next/headers";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  dictionaries,
  dir,
  isLocale,
  type Dictionary,
  type Locale,
} from "./dictionaries";

export * from "./dictionaries";

/** Server-side locale resolution: cookie wins, then default. */
export async function getRequestLocale(): Promise<Locale> {
  const store = await cookies();
  const raw = store.get(LOCALE_COOKIE)?.value;
  return isLocale(raw) ? raw : DEFAULT_LOCALE;
}

export async function getDictAndDir(): Promise<{ dict: Dictionary; locale: Locale; dir: "rtl" | "ltr" }> {
  const locale = await getRequestLocale();
  return { dict: dictionaries[locale], locale, dir: dir(locale) };
}

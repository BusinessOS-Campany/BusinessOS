"use server"

import { cookies } from "next/headers"
import { LANG_COOKIE, type Locale } from "@/lib/i18n"

export async function setLanguageAction(locale: Locale) {
  const cookieStore = await cookies()
  cookieStore.set(LANG_COOKIE, locale, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  })
}
"use client"

import { createContext, useCallback, useContext, useMemo, useTransition } from "react"
import { useRouter } from "next/navigation"
import { dictionary, dirByLocale, type Dictionary, type Locale } from "@/lib/i18n"
import { setLanguageAction } from "@/lib/actions/lang"

type I18nContextValue = {
  locale: Locale
  dir: "ltr" | "rtl"
  t: Dictionary
  setLocale: (locale: Locale) => void
  switching: boolean
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function LangProvider({
  locale,
  children,
}: {
  locale: Locale
  children: React.ReactNode
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const setLocale = useCallback(
    (next: Locale) => {
      if (next === locale) return
      startTransition(async () => {
        await setLanguageAction(next)
        router.refresh()
      })
    },
    [locale, router]
  )

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      dir: dirByLocale[locale],
      t: dictionary[locale],
      setLocale,
      switching: isPending,
    }),
    [locale, setLocale, isPending]
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error("useI18n must be used within <LangProvider>")
  return ctx
}
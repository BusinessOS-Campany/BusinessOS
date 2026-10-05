"use client"

import { ThemeProvider } from "next-themes"
import { Toaster } from "sonner"
import { LangProvider } from "@/components/lang-provider"
import type { Locale } from "@/lib/i18n"

export function Providers({
  locale,
  children,
}: {
  locale: Locale
  children: React.ReactNode
}) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <LangProvider locale={locale}>{children}</LangProvider>
      <Toaster richColors position="top-center" closeButton />
    </ThemeProvider>
  )
}
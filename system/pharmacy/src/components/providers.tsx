"use client";

import { createContext, useContext } from "react";
import type { Locale } from "@/lib/i18n";

export interface ProvidersLocaleContextValue {
  locale: Locale;
  dir: "rtl" | "ltr";
}

const LocaleCtx = createContext<ProvidersLocaleContextValue>({
  locale: "ar",
  dir: "rtl",
});
export const useLocale = () => useContext(LocaleCtx);

import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";

export function Providers({
  children,
  locale,
  dir,
}: {
  children: React.ReactNode;
  locale: Locale;
  dir: "rtl" | "ltr";
}) {
  return (
    <LocaleCtx.Provider value={{ locale, dir }}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        {children}
        <Toaster
          position={dir === "rtl" ? "top-left" : "top-right"}
          richColors
        />
      </ThemeProvider>
    </LocaleCtx.Provider>
  );
}
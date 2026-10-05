"use client"

import { Languages } from "lucide-react"
import { useI18n } from "@/components/lang-provider"
import { localeName, type Locale } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export function LanguageSwitch({
  className,
  size = "lg",
}: {
  className?: string
  size?: "md" | "lg"
}) {
  const { locale, setLocale } = useI18n()
  const next: Locale = locale === "ar" ? "en" : "ar"

  const btnClass =
    size === "lg"
      ? "h-10 px-4 text-sm rounded-md"
      : "h-9 px-3 text-sm rounded-md"

  return (
    <button
      type="button"
      onClick={() => setLocale(next)}
      title={localeName[next]}
      className={cn(
        "inline-flex items-center gap-2 font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        btnClass,
        className
      )}
    >
      <Languages className="h-4 w-4" />
      <span dir="ltr" className={cn(size === "lg" && "hidden sm:inline")}>
        {localeName[next]}
      </span>
    </button>
  )
}
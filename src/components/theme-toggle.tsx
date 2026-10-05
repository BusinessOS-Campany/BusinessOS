"use client";

import { useTheme } from "@/components/theme-provider";
import { Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Light/dark switch. Optional `labels` keeps the accessible name translatable —
 * without them it falls back to the original English strings so the four
 * existing call sites are unaffected.
 */
export function ThemeToggle({
  className,
  labels,
}: {
  className?: string;
  labels?: { toLight: string; toDark: string };
}) {
  const { theme, toggle } = useTheme();

  return (
    <button
      onClick={toggle}
      type="button"
      aria-label={theme === "dark" ? (labels?.toLight ?? "Switch to light mode") : (labels?.toDark ?? "Switch to dark mode")}
      // 36px + generous padding keeps this above the 44px touch target the
      // shell needs on mobile without changing the 32px visual box.
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-lg text-sm transition-colors",
        "bg-slate-200 text-slate-600 hover:bg-slate-300 hover:text-slate-900",
        "dark:bg-white/10 dark:text-neutral-400 dark:hover:bg-white/15 dark:hover:text-white",
        className
      )}
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

import Link from "next/link";
import { cn } from "@/lib/utils";
import { UserNav } from "@/components/user-nav";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Shared brand shell for all non-home public pages (signin/signup/systems/
 * my-apps/select-org/demo/windy/profile): ambient glows, glass header and
 * unified footer.
 *
 * Direction is left to the root layout (Arabic RTL by default); pages that
 * need LTR (e.g. /windy) set it on their own content subtree.
 *
 * Two surface variants, because a dark-only page cannot have a working light
 * mode:
 *
 *   "dark" (default) — the `#050510` base with a `dark` class on the root. The
 *   class re-scopes theme tokens so descendants using `bg-card`/
 *   `text-muted-foreground`/`border-border` render dark even when the visitor
 *   picked the light theme. This is what the marketing and auth pages use, and
 *   it is why they have never supported light mode.
 *
 *   "auto" — semantic tokens only, no forced `dark`, so the page follows the
 *   real theme (see ThemeProvider / the `bos_theme` localStorage key). /profile
 *   uses this because it is an application surface that must honour both themes.
 *
 * `labels` exists because the shell cannot read the dictionary itself: six of
 * its consumers are "use client" (/demo, /signin, /signup, /windy and the two
 * form components), which drags the shell into the client module graph, and a
 * client module cannot call getDictAndDir(). Pages that translate their shell
 * chrome pass the strings down; the rest keep the historical Arabic defaults.
 */
export function OnboardingShell({
  children,
  variant = "dark",
  labels,
}: {
  children: React.ReactNode;
  variant?: "dark" | "auto";
  labels?: {
    signIn: string;
    systems: string;
    copyright: string;
    themeToLight: string;
    themeToDark: string;
  };
}) {
  const dark = variant === "dark";

  const root = dark
    ? "dark relative flex min-h-screen flex-col bg-[#050510] text-white"
    : "relative flex min-h-screen flex-col bg-background text-foreground";
  const header = dark
    ? "sticky top-0 z-50 border-b border-white/[0.08] bg-[#050510]/60 backdrop-blur-2xl supports-[backdrop-filter]:bg-[#050510]/40"
    : "sticky top-0 z-50 border-b border-border bg-background/70 backdrop-blur-2xl supports-[backdrop-filter]:bg-background/50";
  const brandText = dark
    ? "text-base font-bold tracking-tight text-white sm:text-lg"
    : "text-base font-bold tracking-tight text-foreground sm:text-lg";
  const footer = dark ? "border-t border-white/[0.08] py-8" : "border-t border-border py-8";
  const footerBrand = dark ? "text-sm font-bold text-white" : "text-sm font-bold text-foreground";
  const footerLink = dark
    ? "text-white/60 transition-colors hover:text-white"
    : "text-muted-foreground transition-colors hover:text-foreground";
  const footerCopy = dark ? "text-xs text-white/40" : "text-xs text-muted-foreground";
  // The brand-blue orb is invisible at 2% on white, so lift it a little.
  const orbBlue = dark ? "bg-[#0263D1]/[0.02]" : "bg-[#0263D1]/[0.05]";
  const orbPrimary = dark ? "bg-primary/[0.03]" : "bg-primary/[0.06]";
  const orbPrimaryStrong = dark ? "bg-primary/[0.04]" : "bg-primary/[0.07]";

  return (
    <div className={root}>
      {/* Ambient glow layers. The clip lives here, not on the shell root: the
          orbs are up to 500px wide and overflow narrow viewports, but an
          `overflow` value on the root would make it the scrollport and break
          every `sticky` descendant (the header included). */}
      <div className="pointer-events-none fixed inset-0 -z-[5] overflow-hidden">
        <div className={cn("absolute top-1/4 left-1/4 h-[500px] w-[500px] rounded-full blur-[150px]", orbPrimary)} />
        <div className={cn("absolute bottom-1/4 right-1/4 h-[400px] w-[400px] rounded-full blur-[120px]", orbBlue)} />
        <div className={cn("absolute top-1/2 left-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[100px]", orbPrimaryStrong)} />
      </div>

      {/* Glass header */}
      <header className={header}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6">
          <Link href="/" className="group flex items-center gap-2.5">
            <div className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-xl shadow-lg shadow-primary/30 sm:h-9 sm:w-9">
              <img src="/icons/BO.webp" alt="Business OS" className="h-full w-full object-contain" />
            </div>
            <span className={brandText}>Business OS</span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            {variant === "auto" && (
              <ThemeToggle
                labels={
                  labels
                    ? { toLight: labels.themeToLight, toDark: labels.themeToDark }
                    : undefined
                }
              />
            )}
            <UserNav />
          </div>
        </div>
      </header>

      {/* Content slot — pages keep their own <main> for semantics */}
      <div className="relative z-10 flex-1">{children}</div>

      {/* Unified footer */}
      <footer className={footer}>
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg">
              <img src="/icons/BO.webp" alt="Business OS" className="h-full w-full object-contain" />
            </div>
            <span className={footerBrand}>Business OS</span>
          </div>
          <div className={cn("flex items-center gap-6 text-sm", footerLink)}>
            <Link href="/signin" className="transition-colors hover:text-foreground">
              {labels?.signIn ?? "تسجيل الدخول"}
            </Link>
            <Link href="/systems" className="transition-colors hover:text-foreground">
              {labels?.systems ?? "الأنظمة"}
            </Link>
          </div>
          <p className={footerCopy}>
            {labels?.copyright ?? `© ${new Date().getFullYear()} بيزنس أو إس. جميع الحقوق محفوظة.`}
          </p>
        </div>
      </footer>
    </div>
  );
}

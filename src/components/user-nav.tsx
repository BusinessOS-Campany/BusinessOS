"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { authClient } from "@/core/auth/client";

const PROFILE_LINK =
  "group flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 transition-colors hover:border-primary/40 hover:bg-primary/10";

/**
 * Session-aware header actions for the shared public shell.
 *
 * Signed in  -> a single profile button linking to /profile (avatar, or a
 *              monogram fallback when the account has no display name).
 * Signed out -> the "تسجيل الدخول" / "إنشاء حساب" pair.
 *
 * Why the session is read on the client: six of the files that render
 * OnboardingShell are themselves "use client" (/demo, /signin, /signup,
 * /windy and the two form components), which drags the shell - and everything
 * it imports - into the client module graph. A server component calling
 * next/headers() cannot be imported from there; doing so fails the build with
 * "next/headers ... only available in Server Components". The app's server
 * components read the session with auth.api.getSession instead.
 */
export function UserNav() {
  const pathname = usePathname();
  const { data: session, isPending, isRefetching, refetch } = authClient.useSession();

  // The client session atom is sampled once, when the shell first mounts, and
  // is never told about the sessions the app's own paths create on the server:
  // public/signup signs the user in through auth.api.signUpEmail (a cookie on
  // the response), and /auth/landing and the org activate-form redirect do the
  // same. A signed-up user SPA-navigating to /signin?registered=1 or their new
  // /{org}/profile would otherwise keep the atom's stale "signed out" answer
  // and see the "تسجيل الدخول" / "إنشاء حساب" pair while the server holds a
  // valid session. Re-reading /get-session on every route change keeps the
  // header honest without every caller having to ping it.
  const lastPath = useRef<string | null>(null);
  useEffect(() => {
    const isFirst = lastPath.current === null;
    const changed = lastPath.current !== pathname;
    lastPath.current = pathname;
    if (isFirst || changed) {
      // `refetch` resolves with nothing on purpose: it writes the answer into
      // the session atom, which this component already subscribes to. Reading
      // the resolved value would be a bug, not a shortcut.
      void refetch();
    }
  }, [pathname, refetch]);

  // While the session is resolving we render NOTHING rather than the signed-out
  // pair. A signed-in visitor would otherwise see "تسجيل الدخول" / "إنشاء حساب"
  // flash on every navigation and could click one while their session is valid.
  // "Resolving" includes the re-read above: between the route change and the
  // refetch settling, the atom still holds the stale answer, so rendering it
  // would flash the signed-out pair at a user who is genuinely signed in - the
  // exact bug this re-sync exists to fix. The header row is justify-between, so
  // withholding the group does not move the brand - the actions simply appear
  // once the answer is known.
  if (isPending || (!session && isRefetching)) return null;

  if (session?.user) {
    const name = session.user.name ?? "";
    const email = session.user.email ?? "";
    // Initials fall back through display name -> email, so a name-less account
    // (e.g. phone-only signup) still renders something stable rather than an
    // empty circle.
    const initials = name.trim().slice(0, 2) || email.slice(0, 2).toUpperCase();
    return (
      <Link
        href="/profile"
        title={name || email || "الملف الشخصي"}
        aria-label="الملف الشخصي"
        className={PROFILE_LINK}
      >
        <Avatar className="h-9 w-9">
          {session.user.image ? (
            <AvatarImage src={session.user.image} alt={name} />
          ) : initials ? (
            <AvatarFallback className="bg-primary/20 text-primary-foreground">{initials}</AvatarFallback>
          ) : (
            <User className="h-5 w-5 text-white/60 transition-colors group-hover:text-primary" />
          )}
        </Avatar>
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        href="/signin"
        className="rounded-xl px-4 py-2 text-sm font-medium text-white/60 transition-colors hover:text-white"
      >
        تسجيل الدخول
      </Link>
      <Link
        href="/signup"
        className="rounded-xl border border-primary/40 bg-primary/5 px-4 py-2 text-sm font-semibold text-primary transition-all hover:border-primary/60 hover:bg-primary/10"
      >
        إنشاء حساب
      </Link>
    </div>
  );
}

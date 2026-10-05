"use client";

import { SignOutButton as SharedSignOutButton } from "@/components/sign-out-button";

/**
 * Re-export kept so the two `/platform-admin` call sites do not change.
 *
 * This used to hold its own implementation calling a bare `signOut()` with no
 * navigation, which cleared the session but left the admin page on screen. The
 * behaviour now lives in one shared control; see `src/components/sign-out-button.tsx`.
 */
export function SignOutButton({ label = "Sign out" }: { label?: string }) {
  return (
    <SharedSignOutButton
      label={label}
      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white"
    />
  );
}

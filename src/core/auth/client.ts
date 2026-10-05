"use client";

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;

/**
 * Saves the current org's database to `orginazition/<org>/database/<org>.sql`.
 *
 * Called before signing out, because the export needs the session: the server
 * takes the org from the session's active organization and refuses anything else.
 *
 * Bounded and silent on purpose. Signing out must not hang because a dump is
 * slow, and a failed backup is the vault's problem to log, not a reason to trap
 * the user on the page. The in-app autosave is the backstop if this is cut short.
 */
async function saveOrgSqlOnSignOut(): Promise<void> {
  try {
    await Promise.race([
      fetch("/api/v1/organizations/sql", { method: "POST", keepalive: true }),
      new Promise((resolve) => setTimeout(resolve, 8000)),
    ]);
  } catch {
    // Offline or aborted: leave anyway.
  }
}

/**
 * Saves the org, signs out, and then leaves the page, hard.
 *
 * `signOut` on its own is not enough in this app. Better Auth clears the cookie
 * and broadcasts a session update, which updates the *client* session atom, but
 * it does not navigate. The profile, the org pages and the shell are all server
 * components, so a client-side sign-out leaves the current route rendering from
 * the Next.js router cache with a session that no longer exists - the page keeps
 * showing signed-in chrome until a manual refresh, and a protected route the user
 * was already inside stays on screen.
 *
 * A full document navigation is the fix: it drops the router cache and re-runs
 * the server render, which then sees the cleared cookie. This is why the
 * sidebars already did `window.location.href = "/signin"` by hand.
 */
export async function signOutAndRedirect(to = "/signin"): Promise<void> {
  await saveOrgSqlOnSignOut();
  try {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          window.location.href = to;
        },
        onError: () => {
          // Sign out failed (offline, expired session). Still leave: the user
          // asked to be signed out, and staying put implies it worked.
          window.location.href = to;
        },
      },
    });
  } catch {
    // Sign-out response unreadable (e.g. empty body). Better Auth's strict
    // response parser rejects here before either callback above runs. The
    // cookie is already cleared server-side or the session is expired, so
    // leaving is still correct - and a rejection must never become an
    // unhandled promise (the callers are all fire-and-forget `void`).
    window.location.href = to;
  }
}

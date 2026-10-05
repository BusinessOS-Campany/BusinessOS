"use client";

import { useState } from "react";
import { signOutAndRedirect } from "@/core/auth/client";

/**
 * The only sign-out control in the app.
 *
 * Every surface used to implement this itself, and two of them were broken in
 * ways that looked identical from the user's side - "sign out does nothing":
 *
 *  - The org app list used a native `<form action="/api/auth/sign-out"
 *    method="post">`. A form POST sends `application/x-www-form-urlencoded`,
 *    which Better Auth rejects with **415**, so the session was never cleared -
 *    and because a form submission *is* a navigation, the browser replaced the
 *    page with the raw JSON error at `/api/auth/sign-out`. The user was left
 *    staring at the API endpoint, still signed in.
 *  - The platform-admin header used a bare `signOut()` with no navigation. That
 *    clears the cookie but leaves you on the admin page, rendered from the
 *    router cache with a session that no longer exists.
 *
 * Both now go through `signOutAndRedirect`, which clears the session and then
 * forces a full document navigation so the server re-renders without it.
 *
 * `type="button"` is not incidental: the bug this replaces was a submit button
 * posting to an endpoint that cannot accept a form encoding, so this must never
 * be able to submit an enclosing form.
 */
export function SignOutButton({
  label,
  className,
  title,
  redirectTo = "/signin",
}: {
  label: string;
  className?: string;
  title?: string;
  redirectTo?: string;
}) {
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      title={title}
      aria-busy={pending || undefined}
      disabled={pending}
      onClick={() => {
        if (pending) return;
        setPending(true);
        void signOutAndRedirect(redirectTo);
      }}
      className={className}
    >
      {label}
    </button>
  );
}

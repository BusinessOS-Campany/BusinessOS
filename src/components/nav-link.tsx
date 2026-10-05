"use client";

import { useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type NavLinkProps = Omit<React.ComponentProps<typeof Link>, "prefetch">;

/**
 * Navigation link with intent-based prefetching.
 *
 * Next.js prefetches a `<Link>` as soon as it enters the viewport. These
 * routes are dynamic, so a link with no `loading.js` boundary causes Next to
 * render and ship the *entire* page (session lookup, tenant resolution, org
 * settings, module gate, page data) for every link on screen. A sidebar with
 * ~15 links therefore fired ~30 full server renders on every page load, all of
 * them competing with the page the user actually asked for.
 *
 * Here `prefetch={false}` opts out of the automatic viewport + hover prefetch,
 * and we drive the router ourselves once the user shows intent (hover, focus,
 * or touch). The router dedupes repeated `prefetch` calls, so re-hovering the
 * same link is free, and navigation still feels instant.
 */
export function NavLink({ href, children, onMouseEnter, onFocus, onTouchStart, ...rest }: NavLinkProps) {
  const router = useRouter();
  const warmed = useRef(false);

  const warm = useCallback(() => {
    if (warmed.current) return;
    warmed.current = true;
    if (typeof href === "string") router.prefetch(href);
  }, [href, router]);

  return (
    <Link
      {...rest}
      href={href}
      prefetch={false}
      onMouseEnter={(e) => {
        onMouseEnter?.(e);
        warm();
      }}
      onFocus={(e) => {
        onFocus?.(e);
        warm();
      }}
      onTouchStart={(e) => {
        onTouchStart?.(e);
        warm();
      }}
    >
      {children}
    </Link>
  );
}

export default NavLink;

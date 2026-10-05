/**
 * URLs that have to respect where this app is mounted.
 *
 * The app runs standalone at `/grocery` and, inside the platform, under each
 * organization's own mount point (`SYSTEM_BASE_PATH=/gm/grocery`). Next rewrites
 * `next/link` and the router for that base path, but nothing rewrites a URL the
 * app builds by hand — a raw `<a href="/sales/receipt/1">` or a bare
 * `navigator.serviceWorker.register("/sw.js")` leaves the mount point entirely
 * and lands on the platform root, which 404s.
 */

/** Collapses duplicate/leading/trailing slashes into a bare prefix. */
function mountPrefix(basePath?: string | null): string {
  const joined = (basePath ?? "")
    .split("/")
    .filter((segment) => segment.length > 0)
    .join("/");
  return joined ? `/${joined}` : "";
}

/**
 * Where the PWA service worker lives. A worker is scoped by the path it is
 * served from, so registering the origin root would hand the whole origin to
 * the platform's worker and reload the tab whenever it took control.
 */
export function serviceWorkerUrl(basePath?: string | null): string {
  return `${mountPrefix(basePath)}/sw.js`;
}

/**
 * Prefixes an in-app path with the mount point, for the URLs that cannot be
 * handed to `next/link`: a file download, or a link that must open in a new tab
 * without a client-side navigation.
 *
 * Idempotent, so passing an already-prefixed path is safe. Absolute and
 * protocol-relative URLs are returned untouched.
 */
export function appHref(path: string, basePath?: string | null): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith("//")) return path;
  const mark = path.search(/[?#]/);
  const pathname = mark === -1 ? path : path.slice(0, mark);
  const suffix = mark === -1 ? "" : path.slice(mark);

  const segments = pathname.split("/").filter((segment) => segment.length > 0);
  const prefix = mountPrefix(basePath)
    .split("/")
    .filter((segment) => segment.length > 0);

  const alreadyPrefixed =
    prefix.length > 0 &&
    segments.length >= prefix.length &&
    prefix.every((segment, i) => segments[i] === segment);

  const joined = (alreadyPrefixed ? segments : [...prefix, ...segments]).join("/");
  return joined ? `/${joined}${suffix}` : `/${suffix}`;
}

/**
 * `appHref` with the mount point read from the environment: Next inlines
 * `__NEXT_ROUTER_BASEPATH` into the client bundle, and the server has
 * `SYSTEM_BASE_PATH`. Works from both server and client components.
 */
export function mountedHref(path: string): string {
  return appHref(path, process.env.__NEXT_ROUTER_BASEPATH ?? process.env.SYSTEM_BASE_PATH);
}
import { installSerwist } from "@serwist/sw";
import { CacheFirst, ExpirationPlugin } from "serwist";

/** One entry of the build-time precache manifest injected by @serwist/next. */
interface PrecacheEntry {
  url: string;
  revision: string | null;
}

type PrecacheManifest = Array<PrecacheEntry | string>;

/**
 * Serwist globs `public/` with fast-glob, which on Windows returns
 * `icons\icon-192.png`. That path is baked into `public/sw.js` verbatim, and a
 * backslash is not a URL path separator: the install-time `fetch()` for every
 * nested public asset 404s, and the precache lookup for `/icons/icon-192.png`
 * never matches the stored key. Only nested globs are affected, which is why
 * `manifest.json` and the top-level `*.svg` entries look fine and hide it.
 *
 * Normalising here rather than patching `public/sw.js` after the build keeps the
 * fix in source, applies identically on every platform, and cannot be undone by
 * the next build.
 */
function normalizeManifest(entries: PrecacheManifest): PrecacheManifest {
  return entries.map((entry) =>
    typeof entry === "string"
      ? entry.replace(/\\/g, "/")
      : { ...entry, url: entry.url.replace(/\\/g, "/") },
  );
}

// Injected at build time by @serwist/next; not part of any lib's global scope,
// and this file is compiled for the worker where `self` is not a Window.
const injected = (self as unknown as { __SW_MANIFEST?: PrecacheManifest }).__SW_MANIFEST;

installSerwist({
  precacheEntries: normalizeManifest(injected ?? []),
  skipWaiting: true,
  clientsClaim: true,
  runtimeCaching: [
    {
      // The 3D globe's textures and the `.glb` model are ~6 MB of on-demand
      // content behind `/windy`, and nothing on the app shell needs them.
      // Precaching them made install() pull every byte before the worker would
      // activate — minutes of download on the site's ~36 KB/s uplink, charged
      // to a visitor who may never open the globe. Caching on first use instead
      // keeps the second visit fast without making the first one pay for the
      // whole planet.
      matcher: ({ url }) => url.pathname.startsWith("/earth/") || url.pathname.startsWith("/models/"),
      handler: new CacheFirst({
        cacheName: "serwist-runtime-assets",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 24,
            maxAgeSeconds: 60 * 60 * 24 * 30,
          }),
        ],
      }),
    },
  ],
});

import { existsSync } from "node:fs";
import net from "node:net";
import { join } from "node:path";
import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";
import { listSystemSources } from "./src/core/org-vault/system-sources";
import { systemAssetCacheRules } from "./src/core/systems/asset-cache";
import { DEMO_SYSTEMS } from "./src/core/demo/demo-systems";

/**
 * The service worker must never be served stale, otherwise a browser keeps the
 * previous `sw.js` and a released fix never reaches installed clients. Serwist
 * writes `public/sw.js` with no content hash, so this has to be explicit.
 */
const SW_HEADERS = [
  { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, max-age=0" },
  { key: "Service-Worker-Allowed", value: "/" },
];

/**
 * `public/` assets are content-stable and served behind a CDN that currently
 * revalidates every single one of them. They carry no build hash, so the long
 * TTL is only safe because a change to any of them also changes its name (or
 * ships a new build that busts the `sw.js` precache).
 *
 * Next already sends `public, max-age=31536000, immutable` for hashed
 * `/_next/static` output and cannot be overridden there — this list is only
 * what it does not cover.
 */
const LONG_CACHE = "public, max-age=31536000, immutable";

/** Mutable HTML/RSC: the shell is cheap to revalidate, stale auth state is not. */
const HTML_CACHE = "no-cache, must-revalidate";

/**
 * `/api/**` is tenant data behind a session. It must never be written to a
 * shared cache; the private/no-store pair also stops Cloudflare from storing it.
 */
const API_CACHE = "private, no-store, max-age=0";

/**
 * The two exceptions to `no-store`, and the only ones: revalidatable binary
 * media rather than tenant JSON. `no-store` forbids the browser from keeping
 * the body, so it turned every profile view into a full re-download of the
 * avatar and the cover. `private, no-cache` still blocks every shared cache and
 * still forces a revalidation before the cached copy is used, so nothing
 * sensitive is stored anywhere but the user's own browser. Defined here rather
 * than inlined so it cannot drift from the value the media route actually sends.
 */
const MEDIA_CACHE_CONTROL = "private, no-cache, must-revalidate, max-age=60";

/** Rewrites for the paths a demo system is not running behind. */
const UNAVAILABLE_PREFIX = "/system-unavailable";

/**
 * `/app/<system>` is not a page in this app. It is the org's own copy of an
 * installed system, served by the customer's own files from
 * `orginazition/<org>/systems/<system>/`, running as its own process against its
 * own database.
 *
 * Every folder under `system/` gets a pair of rewrites into the internal
 * forwarding handler, which resolves the org from the session and proxies to
 * that org's runtime — so adding a system to `system/` is all it takes for it to
 * be reachable at `/app/<slug>`. The handler rejects an org that has not been
 * approved and installed it, so the route existing is not the same as access
 * being granted.
 *
 * Built at config time from the filesystem, and `beforeFiles` so these win over
 * any page in `src/app/app/` at the same path.
 */
function orgSystemRewrites() {
  return listSystemSources().flatMap((slug) => [
    { source: `/app/${slug}`, destination: `/system-proxy/${slug}` },
    { source: `/app/${slug}/:path*`, destination: `/system-proxy/${slug}/:path*` },
  ]);
}

interface DemoUpstream {
  /** Catalog slug from the registry, e.g. `grocery`. */
  slug: string;
  /**
   * Public path the system is served under, e.g. `/demo/grocery`. Kept separate
   * from `slug` because the two differ: an app under `demo-systems/` is mounted
   * inside the `/demo` namespace, and the upstream serves itself at that same
   * path because of its own `basePath`.
   */
  mount: string;
  /** Absolute upstream origin, or null when the system cannot be served. */
  origin: string | null;
}

/**
 * Is anything actually listening on this origin's host and port?
 *
 * TCP connect only — no request is made, so an upstream that is up but
 * unhealthy is still treated as present, and a probe can never mutate state.
 * A short timeout keeps the build from hanging on a firewalled host.
 */
function isReachable(origin: string): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return Promise.resolve(false);
  }
  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  const host = url.hostname === "localhost" ? "127.0.0.1" : url.hostname;
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const settle = (reachable: boolean) => {
      socket.destroy();
      resolve(reachable);
    };
    socket.setTimeout(1_500);
    socket.once("connect", () => settle(true));
    socket.once("timeout", () => settle(false));
    socket.once("error", () => settle(false));
  });
}

/**
 * Where a demo system can actually be reached, decided at build time.
 *
 * A system is servable when its source folder is in this workspace (it is
 * deployed alongside the platform), or when an env var names an upstream that
 * answers a TCP connect. When neither holds, the rewrite below points at a real
 * page instead of a dead port.
 *
 * The probe is the part that matters. `.env.local` names a URL for seven of the
 * nine systems, and nothing stops that URL from being a port with nothing on
 * it — which is exactly the state they were in. Trusting the env var alone
 * reproduced nine permanent 500s. Pointing a rewrite at an upstream that does
 * not answer is never better than saying the system is not running.
 */
function resolveDemoUpstreams(root: string): Promise<DemoUpstream[]> {
  return Promise.all(
    DEMO_SYSTEMS.map(async (system): Promise<DemoUpstream> => {
      const override = process.env[system.envVar]?.trim();
      const hasSource = existsSync(join(root, system.sourceDir, "package.json"));
      const { slug, rootPath: mount } = system;

      if (hasSource) {
        return { slug, mount, origin: override?.replace(/\/+$/, "") ?? `http://localhost:${system.port}` };
      }
      if (override && (await isReachable(override))) {
        return { slug, mount, origin: override.replace(/\/+$/, "") };
      }
      return { slug, mount, origin: null };
    }),
  );
}

/** True when the dev server is running, which is never the production answer. */
const isDev = process.env.NODE_ENV === "development";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  register: true,
  // Only the app shell belongs in the precache. `earth/**` used to be here and
  // dragged 3.6 MB of globe textures into every install; `icons/**` pulled in
  // the 1.16 MB `BO.png`. Both are now runtime-cached on first use instead
  // (see `src/app/sw.ts`).
  globPublicPatterns: [
    "manifest.json",
    "icons/*.webp",
    "icons/icon-*.png",
    "icons/favicon-*.png",
    "icons/apple-touch-icon.png",
    "*.svg",
  ],
  /**
   * Drop every build chunk from the precache, and with it the single largest
   * cost on the site.
   *
   * Out of the box @serwist/next precaches all 258 files under `.next/static`
   * — 4.1 MB — inside `install()`. On this site's ~36 KB/s uplink that is
   * ~122 seconds of background download that saturates the connection while the
   * visitor's own page is still loading, and it is charged in full to every
   * first-time visitor whether or not their session ever opens those chunks.
   *
   * It is also redundant. Every build chunk is content-hashed and is served
   * with `max-age=31536000, immutable` (see `headers()`), so the browser
   * caches it and Cloudflare answers from the edge — lazily, and only for what
   * is actually requested. The service worker adds nothing here and costs a
   * great deal.
   *
   * `manifestTransforms` is used rather than `globPatterns` because the latter
   * is accepted at runtime but absent from `InjectManifestOptions`, so it
   * cannot be passed without a cast. Matching on `static/chunks/` and
   * `static/css/` rather than a directory prefix is deliberate: these
   * transforms run before @serwist/next rewrites the URLs, so the entries
   * still look like `.next/static/...`, not `/_next/static/...`.
   */
  manifestTransforms: [
    (entries) => ({
      manifest: entries.filter((e) => !/static\/(chunks|css)\//.test(e.url)),
      warnings: [],
    }),
  ],
  disable: isDev,
});

/**
 * Dev writes to its own directory. A dev server and a `next start` sharing one
 * `.next` is the failure this exists to prevent: dev overwrites the manifest
 * and the hashed static chunks that the running production server is serving
 * from, so the live site starts returning 404s for its own JavaScript.
 */
const distDir = process.env.NEXT_DIST_DIR ?? (isDev ? ".next-dev" : ".next");

const nextConfig: NextConfig = {
  distDir,
  devIndicators: false,
  // Fingerprinting the framework and version helps nobody and is a free
  // scanner target for anyone probing for an outdated Next.js.
  poweredByHeader: false,
  /**
   * Keep the file tracer out of every tree this app does not build from.
   *
   * The tracer walks the project root, and this root holds five cloned grocery
   * apps — each with its own `node_modules`, its own Prisma client and its own
   * `.next` build output — plus the independent sub-apps under `public/` and the
   * older `demo-systems/` tree. None of it is imported by `src/`, and `tsconfig`
   * already excludes every one of these paths for exactly that reason, but the
   * tracer does not read `tsconfig`. Left alone it holds all of it in memory at
   * once and the production build dies with a heap OOM part-way through
   * "Creating an optimized production build".
   *
   * `'/*'` applies to every route; the keyed globs are the ones that would
   * otherwise miss the catch-all.
   */
  outputFileTracingExcludes: {
    "/*": [
      "orginazition/**",
      "system/**",
      "demo-systems/**",
      "apps/**",
      "public/**",
      ".next-dev/**",
      ".data/**",
    ],
    "/api/**": ["orginazition/**", "system/**", "demo-systems/**", "apps/**", "public/**"],
  },
  async headers() {
    return [
      { source: "/sw.js", headers: SW_HEADERS },
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: API_CACHE },
          { key: "X-DNS-Prefetch-Control", value: "off" },
        ],
      },
      {
        // AFTER the `/api/:path*` rule above, because the last rule to set a
        // header wins — that is the same mechanism the `/_next/static` override
        // further down relies on.
        //
        // The avatar and the cover are bytes, not JSON: `no-store` on them made
        // the browser throw the body away, so every profile view re-downloaded
        // the full image (up to 2 MB + 5 MB) from the origin. `private,
        // no-cache` keeps them private and always-revalidated, and the route's
        // own ETag turns the repeat load into a 304 with no body.
        source: "/api/v1/profile/:kind(avatar|cover)",
        headers: [{ key: "Cache-Control", value: MEDIA_CACHE_CONTROL }],
      },
      {
        source: "/icons/:path*",
        headers: [{ key: "Cache-Control", value: LONG_CACHE }],
      },
      {
        source: "/models/:path*",
        headers: [{ key: "Cache-Control", value: LONG_CACHE }],
      },
      {
        source: "/earth/:path*",
        headers: [{ key: "Cache-Control", value: LONG_CACHE }],
      },
      {
        source: "/:path*.svg",
        headers: [{ key: "Cache-Control", value: LONG_CACHE }],
      },
      { source: "/manifest.json", headers: [{ key: "Cache-Control", value: LONG_CACHE }] },
      { source: "/favicon.ico", headers: [{ key: "Cache-Control", value: LONG_CACHE }] },
      {
        // Everything left is an HTML/RSC document.
        source: "/:path*",
        headers: [
          { key: "Cache-Control", value: HTML_CACHE },
          { key: "X-DNS-Prefetch-Control", value: "on" },
        ],
      },
      {
        // LAST, because when two rules set the same header the last one wins —
        // this has to override the HTML rule above, not the other way round.
        //
        // Next only stamps `31536000, immutable` on the assets it recognises as
        // immutable; the rest of `/_next/static` — including the 229 KB
        // stylesheet and the `app/page` and `app/layout` chunks, i.e. the
        // critical path of every first paint — ships with `max-age=14400,
        // must-revalidate`. Every one of those filenames is content-hashed
        // (`css/e4266e0c1a8791cd.css`, `app/page-3888412c358b586f.js`), so a
        // change to the file produces a new name and nothing is ever stale.
        // Leaving them at four hours means ~344 KB revalidates through the
        // tunnel on every visit, which is the largest remaining cost on a
        // page load.
        source: "/_next/static/:path*",
        headers: [{ key: "Cache-Control", value: LONG_CACHE }],
      },
      // The same for a proxied org system's own hashed assets, at both the path a
      // system is served at and the legacy one. Without these the catch-all HTML
      // rule above won — configured headers are applied after the proxy handler
      // has set its own — and the system re-downloaded about a megabyte of
      // JS/CSS/fonts on every single navigation.
      ...systemAssetCacheRules(listSystemSources()),
    ];
  },
  async rewrites() {
    const upstreams = await resolveDemoUpstreams(process.cwd());
    const upstreamFor = (slug: string): DemoUpstream =>
      upstreams.find((u) => u.slug === slug) ?? { slug, mount: `/${slug}`, origin: null };

    /**
     * A demo system, or the "not running here" page when it has no upstream.
     * The public path comes from the registry (`mount`), which derives it from
     * where the sub-app's source lives, so an app under `demo-systems/` is served
     * under `/demo/<slug>` and matches the `basePath` it was built with. The
     * upstream is addressed at the same path for the same reason.
     *
     * Exact root first so the empty `:path*` below cannot send `/demo/grocery` to
     * a trailing-slash URL (downstream 308-loops).
     */
    const proxied = (slug: string) => {
      const { mount, origin } = upstreamFor(slug);
      const base = origin ? `${origin}${mount}` : `${UNAVAILABLE_PREFIX}/${slug}`;
      return [
        { source: mount, destination: base },
        { source: `${mount}/:path*`, destination: `${base}/:path*` },
      ];
    };

    // SAMA's API only gets a rewrite when its SPA is actually being served;
    // otherwise the API rule would proxy to a dead port on a path the
    // unavailable page is supposed to own.
    const samaWeb = upstreamFor("sama").origin;
    const samaApi = samaWeb ? (process.env.SAMA_API_URL ?? "http://localhost:3103") : null;

    return {
      beforeFiles: [
        ...orgSystemRewrites(),
        // SAMA is a Vite SPA plus a separate Express API. API first so it is
        // not swallowed by the SPA catch-all below.
        ...(samaApi
          ? [{ source: "/sama/api/:path*", destination: `${samaApi}/api/:path*` }]
          : []),
        ...proxied("grocery"),
        ...proxied("sama"),
        ...proxied("celia"),
        ...proxied("hospital"),
        ...proxied("dental"),
        ...proxied("laboratory"),
        ...proxied("pharmacy"),
        ...proxied("pos"),
        ...proxied("optometry"),
      ],
    };
  },
  /**
   * The old top-level mount of any app that now lives in the `/demo` namespace,
   * e.g. `/grocery/inventory` to `/demo/grocery/inventory`.
   *
   * A redirect rather than a second rewrite on purpose. Rewriting both paths
   * would serve the app fine, but the sub-app's own `basePath` is `/demo/grocery`,
   * so every link, redirect and asset it emitted would send the user back under
   * the new path anyway - leaving a `/grocery` URL that is reachable once and
   * then immediately disappears on first navigation. Redirecting makes the new
   * path the only addressable one while keeping existing bookmarks working.
   *
   * Exact root is matched separately because `:path*` does not match the
   * empty case, so a single rule would leave `/grocery` itself 404ing.
   */
  async redirects() {
    return DEMO_SYSTEMS.flatMap((system) => {
      const legacy = `/${system.slug}`;
      if (system.rootPath === legacy) return [];
      return [
        { source: legacy, destination: system.rootPath, permanent: true },
        {
          source: `${legacy}/:path*`,
          destination: `${system.rootPath}/:path*`,
          permanent: true,
        },
      ];
    });
  },
};

export default withSerwist(nextConfig);
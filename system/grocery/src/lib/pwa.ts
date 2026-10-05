import type { MetadataRoute } from "next";
import { appHref } from "./app-url";

/**
 * The installable-app manifest.
 *
 * Next rewrites the `<link rel="manifest">` href it emits, but not the body of
 * `app/manifest.ts`, so every path below is ours to get right. Root-absolute
 * values here are what stopped the tenant apps being installable: `start_url`
 * opened the platform home page instead of the grocery app, and `scope: "/"`
 * claimed the entire origin, which five orgs on one domain cannot share.
 */

export type PwaLabels = { storeName: string; appName: string };

/** The mount point, normalised, with no trailing slash. Defaults to standalone. */
export function manifestScope(basePath?: string | null): string {
  const explicit = basePath?.split("/").filter((segment) => segment.length > 0);
  return explicit?.length ? appHref("", basePath) : "/grocery";
}

export function buildPwaManifest(
  basePath: string | null | undefined,
  labels: PwaLabels,
): MetadataRoute.Manifest {
  const scope = manifestScope(basePath);

  return {
    name: `${labels.storeName} — ${labels.appName}`,
    short_name: labels.appName,
    description: "Grocery store management system / نظام إدارة متجر البقالة",
    // `id` must match `start_url`'s origin+path so an update replaces the
    // existing install instead of installing a second copy beside it.
    id: scope,
    // Dashboard, not "/": the app's own landing route under the mount point.
    start_url: appHref("/dashboard", scope),
    scope,
    display: "standalone",
    orientation: "portrait-primary",
    dir: "rtl",
    lang: "ar",
    background_color: "#ffffff",
    theme_color: "#16a34a",
    categories: ["business", "productivity", "shopping"],
    icons: [
      { src: appHref("/icons/icon-192.png", scope), sizes: "192x192", type: "image/png" },
      { src: appHref("/icons/icon-512.png", scope), sizes: "512x512", type: "image/png" },
      {
        src: appHref("/icons/icon-maskable-512.png", scope),
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
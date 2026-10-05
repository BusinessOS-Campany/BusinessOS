import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

/**
 * Where this system is mounted.
 *
 * Standalone it is `/dental`. When the platform runs an organization's own copy
 * of it, the process is started with `SYSTEM_BASE_PATH=/<org>/dental`, so the
 * customer's URL, this app's links and its asset URLs are all the same thing —
 * no rewriting, and nothing in the app needs to know which mode it is in.
 *
 * `next/link` adds this value for you; a raw `fetch("/api/…")` or
 * `redirect("/…")` does not, so those still have to be written mount-relative.
 */
const basePath = process.env.SYSTEM_BASE_PATH ?? "/dental";

// This app is a standalone project nested inside the ERP repo, so Turbopack
// used to walk up, find the ERP package-lock.json as well as its own, and infer
// the ERP as the workspace root. Pin the root to this folder so file watching
// and module resolution stay inside the app that is actually running.
const projectRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  basePath,
  turbopack: {
    root: projectRoot,
  },
  async headers() {
    return [
      {
        // Service worker updates must never be served stale by the browser.
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-store, no-cache, must-revalidate" }],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
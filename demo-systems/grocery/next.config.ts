import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// This app is a standalone project nested inside the ERP repo, so Turbopack
// used to walk up, find the ERP package-lock.json as well as its own, and infer
// the ERP as the workspace root. Pin the root to this folder so file watching
// and module resolution stay inside the app that is actually running.
const projectRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Must match `rootPath` for slug "grocery" in the platform registry
  // (src/core/demo/demo-systems.ts), which derives it from sourceDir. A sub-app
  // serves itself at whatever basePath it was built with, so if the platform
  // rewrote a different path here every in-app link would 404.
  basePath: "/demo/grocery",
  turbopack: {
    root: projectRoot,
  },
  outputFileTracingIncludes: {
    "/api/reports/print": ["./src/features/reports/ejs/*.ejs"],
    "/api/reports/pdf": ["./src/features/reports/pdf/fonts/*"],
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
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;

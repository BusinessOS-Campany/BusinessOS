import type { NextConfig } from "next";

/**
 * Where this system is mounted.
 *
 * Standalone it is `/grocery`. When the platform runs an organization's own copy
 * of it, the process is started with `SYSTEM_BASE_PATH=/app/grocery` so the
 * customer's URL, this app's links and its asset URLs are all the same thing —
 * no rewriting, and nothing in the app needs to know which mode it is in.
 */
const basePath = process.env.SYSTEM_BASE_PATH ?? "/grocery";

const nextConfig: NextConfig = {
  basePath,
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

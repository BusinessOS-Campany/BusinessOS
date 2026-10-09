import type { NextConfig } from "next";

/**
 * Where this system is mounted.
 *
 * Standalone it is `/pharmacy`. When the platform runs an organization's own copy
 * of it, the process is started with `SYSTEM_BASE_PATH=/{org}/pharmacy` so the
 * customer's URL, this app's links and its asset URLs are all the same thing —
 * no rewriting, and nothing in the app needs to know which mode it is in.
 *
 * This has to be read here rather than hardcoded: Next bakes `basePath` into the
 * build, so a literal `/pharmacy` would serve every organization's clone at a
 * path its own proxy does not forward to, and every page and `/_next/static`
 * request would 404.
 */
const basePath = process.env.SYSTEM_BASE_PATH ?? "/pharmacy";

const nextConfig: NextConfig = {
  basePath,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;

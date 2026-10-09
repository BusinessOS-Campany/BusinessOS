import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// This app is a standalone project nested inside the ERP repo, so Turbopack
// walks up, finds the ERP package-lock.json as well as its own, and infers the
// ERP as the workspace root — which pulls the platform's own
// `src/instrumentation.ts` into this build and fails on it. Pin the root to this
// folder so file watching and module resolution stay inside the app that is
// actually running.
const projectRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  basePath: "/pharmacy",
  turbopack: {
    root: projectRoot,
  },
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

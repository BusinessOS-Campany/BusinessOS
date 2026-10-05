import { ok, withRoute } from "@/core/http/api";

export const GET = withRoute("health", async () =>
  ok({
    status: "ok",
    service: "business-os",
    version: "0.1.0",
    timestamp: new Date().toISOString(),
  }),
);

import pino from "pino";

const REDACT_PATHS = [
  "password",
  "*.password",
  "token",
  "*.token",
  "authorization",
  "req.headers.authorization",
  "req.headers.cookie",
  "secret",
  "*.secret",
];

declare global {
  var __bosLogger: pino.Logger | undefined;
}

export const logger: pino.Logger =
  globalThis.__bosLogger ??
  pino({
    level: process.env.LOG_LEVEL ?? "info",
    redact: REDACT_PATHS,
    base: { app: "business-os" },
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__bosLogger = logger;
}

/** Child logger bound to a request lifecycle. */
export function requestLogger(requestId: string, bindings: Record<string, unknown> = {}) {
  return logger.child({ requestId, ...bindings });
}

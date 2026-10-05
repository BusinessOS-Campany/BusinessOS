import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    globals: true,
    include: ["tests/**/*.test.ts"],
    pool: "forks",
    testTimeout: 30_000,
  },
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
});

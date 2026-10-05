// Loads .env.local for standalone scripts (tsx seed etc.). Next.js loads it
// automatically for the app itself; this is only for non-Next entrypoints.
try {
  (process as unknown as { loadEnvFile?: (path?: string) => void }).loadEnvFile?.(".env.local");
} catch {
  // fall back to the real environment
}
export {};

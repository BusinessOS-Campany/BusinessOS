/**
 * Freshness check for the in-process memo that keeps repeated derived reads
 * (the notification condition scan, store settings) off every navigation.
 *
 * A `null` timestamp means "never computed", which is always stale — so a cold
 * process still does the work once instead of serving an empty result.
 */
export function isFresh(at: number | null, now: number, ttlMs: number): boolean {
  return at !== null && now - at < ttlMs;
}
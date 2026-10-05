function Bar({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-muted ${className ?? ""}`} />;
}

/**
 * Skeleton for the platform console's first paint.
 *
 * A real Suspense boundary, not a spinner: it is what Next streams while an admin
 * route resolves, and it also caps what the router needs to prefetch for a link —
 * without it a link prefetches the entire page. Measured on 2026-10-03, a click
 * that reaches the real content spent 400–1900 ms showing nothing at all, because
 * the segment had no boundary to fall back to.
 *
 * `aria-busy` is load-bearing, not decoration: it is how a screen reader knows the
 * region is a placeholder, and it is the marker
 * `scripts/platform-admin-nav-check.ts` waits on the *absence* of to decide the
 * page has actually rendered. Shaped like the overview page so the transition
 * barely moves.
 */
export default function PlatformAdminLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <Bar className="h-9 w-56" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Bar key={i} className="h-28 w-full" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Bar className="h-80 w-full lg:col-span-2" />
        <Bar className="h-80 w-full" />
      </div>
    </div>
  );
}
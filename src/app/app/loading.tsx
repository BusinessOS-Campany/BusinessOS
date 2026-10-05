function Bar({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-muted ${className ?? ""}`} />;
}

/**
 * Skeleton for the tenant shell's first paint.
 *
 * This is a real Suspense boundary, not a spinner: it is what Next streams
 * while the route resolves, and it also caps what the router needs to prefetch
 * for a link — without it, a link prefetches the entire page.
 */
export default function AppLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <Bar className="h-32 w-full" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Bar key={i} className="h-28 w-full" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Bar className="h-80 w-full" />
        <Bar className="h-80 w-full" />
      </div>
    </div>
  );
}

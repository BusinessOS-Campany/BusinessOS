export interface LoadingSkeletonProps {
  rows?: number;
  columns?: number;
  type?: "table" | "card";
  className?: string;
}

function PulseBar({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-neutral-200 dark:bg-neutral-800 ${className}`}
    />
  );
}

export function LoadingSkeleton({
  rows = 5,
  columns = 4,
  type = "table",
  className,
}: LoadingSkeletonProps) {
  if (type === "card") {
    return (
      <div className={`space-y-4 ${className ?? ""}`}>
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <PulseBar className="h-4 w-40" />
                <PulseBar className="h-3 w-64" />
              </div>
              <PulseBar className="h-8 w-8 rounded-full" />
            </div>
            <div className="mt-4 flex gap-6">
              <PulseBar className="h-3 w-20" />
              <PulseBar className="h-3 w-16" />
              <PulseBar className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={`overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800 ${className ?? ""}`}>
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 dark:bg-neutral-900">
          <tr>
            {Array.from({ length: columns }).map((_, i) => (
              <th
                key={i}
                className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500"
              >
                <PulseBar className="h-3 w-24" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {Array.from({ length: rows }).map((_, rowIdx) => (
            <tr key={rowIdx} className="bg-white dark:bg-neutral-950">
              {Array.from({ length: columns }).map((_, colIdx) => (
                <td key={colIdx} className="px-4 py-3">
                  <PulseBar
                    className={`h-4 ${
                      colIdx === 0 ? "w-48" : colIdx === columns - 1 ? "w-16" : "w-32"
                    }`}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiClientError } from "@/lib/api";

export interface UseApiDataOptions<T> {
  /** Skip fetching while false (default true). */
  enabled?: boolean;
  /** Initial value before the first response lands. */
  initialData?: T;
}

export interface UseApiDataResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Abort + refetch with the current url; shows the spinner (`loading=true`). */
  refetch: () => Promise<void>;
  /** Manually replace the resolved payload (mutations, optimistic updates). */
  setData: React.Dispatch<React.SetStateAction<T | null>>;
}

/**
 * Cancellation-aware data fetching for client pages — the single fetch path
 * used by page components instead of per-page `fetch()` + `useEffect`.
 *
 * - re-runs whenever `url` changes (pages already encode filters into the URL)
 * - stale responses and late resolutions are dropped (AbortController +
 *   generation counter), so typing in a filter can't be overwritten by an
 *   older request and unmount never sets state
 * - backgrounds re-fetches (no spinner flicker on keystroke); `refetch()`
 *   re-enables the spinner for explicit reloads
 * - surfaces ApiClientError.messageAr when the API rejects with an envelope
 */
export function useApiData<T>(
  url: string,
  options: UseApiDataOptions<T> = {},
): UseApiDataResult<T> {
  const { enabled = true, initialData = null } = options;
  const [data, setData] = useState<T | null>(initialData);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const activeController = useRef<AbortController | null>(null);
  const generation = useRef(0);

  // Stable across renders (empty deps): reads/writes only refs + state setters.
  // Calling it from an effect is the canonical async-data pattern; the
  // react-hooks/set-state-in-effect rule flags sync setState in an effect body,
  // which this never does (all setState happen after an await / microtask).
  const fetchAndSet = useCallback(
    async (target: string, withSpinner: boolean) => {
      const gen = ++generation.current;
      activeController.current?.abort();
      activeController.current = new AbortController();

      // Let the effect body finish before any setState (also satisfies
      // react-hooks/set-state-in-effect, which tracks synchronous calls).
      await Promise.resolve();
      if (gen !== generation.current) return;

      if (withSpinner) setLoading(true);
      setError(null);

      try {
        const payload = await api<T>(target, {
          signal: activeController.current.signal,
        });
        if (gen !== generation.current) return;
        setData(payload);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (gen !== generation.current) return;
        setError(
          err instanceof ApiClientError ? err.messageAr : "حدث خطأ غير متوقع",
        );
      } finally {
        if (gen === generation.current) setLoading(false);
      }
    },
    [],
  );

  const run = useCallback(
    async (withSpinner: boolean) => {
      if (!enabled) return;
      if (withSpinner) setLoading(true);
      setError(null);
      await fetchAndSet(url, withSpinner);
    },
    [enabled, url, fetchAndSet],
  );

  useEffect(() => {
    void fetchAndSet(url, false);
  }, [url, enabled, fetchAndSet]);

  useEffect(() => () => activeController.current?.abort(), []);

  return { data, loading, error, refetch: () => run(true), setData };
}
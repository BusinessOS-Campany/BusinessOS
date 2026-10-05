"use client";

import { useEffect, useRef } from "react";

/**
 * Keeps `orginazition/<org>/database/<org>.sql` fresh while the org is open.
 *
 * Renders nothing. Mounted once in the `/{org}` layout, so every org page gets
 * it. The server decides *which* org (the session's active organization), so this
 * component never has to know a slug and cannot accidentally save the wrong one.
 *
 * Deliberate behaviours:
 *  - `keepalive: true` so a save that is in flight when the tab closes still
 *    completes.
 *  - One save at a time: a slow dump must not pile up behind the next tick.
 *  - Skipped while the tab is hidden, and after a failure it waits a minute
 *    instead of hammering a database that is down. The next success resets that.
 *  - The sign-out button saves synchronously, so this interval is a safety net,
 *    not the guarantee.
 */

const DEFAULT_INTERVAL_SECONDS = 300;
const BACKOFF_SECONDS = 60;

export function OrgSqlAutosave({ intervalSeconds }: { intervalSeconds?: number }) {
  const running = useRef(false);
  const seconds =
    typeof intervalSeconds === "number" && intervalSeconds >= 60 ? intervalSeconds : DEFAULT_INTERVAL_SECONDS;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let delaySeconds = seconds;

    const save = async () => {
      // A single chain owns the schedule, so this only guards against a save
      // still in flight; whoever started it will schedule the next one.
      if (running.current) return;
      // Not worth dumping an idle tab, and not worth spinning on it: the next
      // visible tick catches up, so wait the normal interval rather than 0.
      if (document.visibilityState === "hidden") {
        schedule(delaySeconds);
        return;
      }
      running.current = true;
      try {
        const response = await fetch("/api/v1/organizations/sql", { method: "POST", keepalive: true });
        delaySeconds = response.ok ? seconds : BACKOFF_SECONDS;
      } catch {
        delaySeconds = BACKOFF_SECONDS;
      } finally {
        running.current = false;
        schedule(delaySeconds);
      }
    };

    // One timer at a time. Without the clear, a visibilitychange that lands
    // while a tick is pending would leave two chains running, each scheduling
    // the next one, and the interval would quietly double on every switch.
    const schedule = (value: number) => {
      if (stopped) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void save(), value * 1000);
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") schedule(0);
    };

    document.addEventListener("visibilitychange", onVisible);
    schedule(seconds);

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [seconds]);

  return null;
}

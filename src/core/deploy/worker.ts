import { logger } from "@/core/logging/logger";
import { requeueStaleDeployments } from "./queue";
import { processNextDeployment } from "./pipeline";

/**
 * Deployment worker: drains the deployment queue from inside the platform
 * process.
 *
 * It lives here rather than in a standalone script because the supervisor's
 * runtime table is in-memory — a separate process could not stop or replace a
 * runtime the platform is serving through. Started from `instrumentation.ts`,
 * exactly like the outbox worker it is modelled on.
 *
 * One deployment runs at a time: a build is minutes of a full Node process, and
 * two at once would only make the first one slower on the same machine. The
 * loop re-arms itself after every pass, so an empty queue costs one interval of
 * idle, and a failure inside a pass is recorded on the deployment row (see
 * `processNextDeployment`) and never stops the loop.
 */

const DEFAULT_INTERVAL_MS = 5_000;

let pollTimer: ReturnType<typeof setTimeout> | null = null;
let busy = false;
let reconciled = false;

/**
 * Starts the polling loop. Idempotent: a second call is a no-op, so importing
 * the module twice (a hot reload, two instrumentation registrations) cannot
 * start two loops.
 */
export function startDeploymentWorker(intervalMs = DEFAULT_INTERVAL_MS): void {
  if (pollTimer) return;

  const poll = async (): Promise<void> => {
    if (busy) {
      pollTimer = setTimeout(poll, intervalMs);
      return;
    }
    busy = true;
    try {
      if (!reconciled) {
        reconciled = true;
        const requeued = await requeueStaleDeployments();
        if (requeued > 0) {
          logger.warn({ requeued }, "[deploy] requeued deployments stranded by a previous process");
        }
      }
      // Drain until the queue is empty, so a burst of pushes is not paced at one
      // deployment per interval.
      for (;;) {
        const didWork = await processNextDeployment();
        if (!didWork) break;
      }
    } catch (err) {
      // The worker must never crash the platform.
      logger.error({ err }, "[deploy] worker pass failed");
    } finally {
      busy = false;
      pollTimer = setTimeout(poll, intervalMs);
    }
  };

  void poll();
}

export function stopDeploymentWorker(): void {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

/** Test seam: forgets the started state without touching timers. */
export function __resetDeploymentWorkerState(): void {
  busy = false;
  reconciled = false;
}

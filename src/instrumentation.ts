/**
 * Platform process startup.
 *
 * Exists for one reason: the per-org runtime table in the supervisor is
 * in-memory, so a platform restart used to forget every org system it had
 * started — while the Node processes themselves kept running. The first click on
 * "open my system" after a restart then paid for a full cold boot of something
 * that had been serving all along, which is what made the button feel slow for
 * no visible reason.
 *
 * `adoptPersistedRuntimes` puts those back by probing each recorded port, so
 * the first request finds a warm runtime instead of starting a second one.
 */

/**
 * Next calls `register` in every environment, and the supervisor is Node-only —
 * it spawns processes and reads the filesystem. Importing it unconditionally
 * would break the edge build, so the Node runtime is the only one that loads it.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { adoptPersistedRuntimes } = await import("@/core/systems/runtime/supervisor");

  // Deliberately not awaited: `register` must complete before the server
  // accepts requests, and a probe per org is real latency on startup. Adoption is
  // an optimisation — any runtime not picked up here is booted normally by the
  // first request that needs it — so it runs alongside startup and is never on
  // the critical path to serving a request.
  void adoptPersistedRuntimes().catch(() => {
    // A failure to rehydrate must not stop the platform booting; the cold path
    // is always there as the fallback.
  });

  // The deployment worker shares the supervisor's in-memory runtime table, so it
  // has to run in this process rather than a standalone one. Imported lazily for
  // the same reason the supervisor is: it drags in child_process and the
  // filesystem, neither of which exists on the edge runtime.
  const { startDeploymentWorker } = await import("@/core/deploy/worker");
  startDeploymentWorker();
}

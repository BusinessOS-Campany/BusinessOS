import type { RuntimeState } from "./supervisor";

/**
 * The two decisions that keep opening an org's system from costing a build.
 *
 * Getting to a running system means a `prisma migrate deploy`, a bootstrap and a
 * production build. The first two used to run on *every* boot, and the build ran
 * through `execFileSync`, which blocks the platform's event loop for its whole
 * duration — so a cold open made every page on the site slow, not just the system
 * being opened.
 */

/**
 * How long a successful health probe is trusted before the runtime is asked
 * again.
 *
 * Short enough that a crashed process is noticed within a navigation, long enough
 * that a page's worth of chunk requests costs one probe instead of one per chunk.
 */
export const HEALTH_RECHECK_MS = 15_000;

/**
 * True when the folder's current sources are what was last built.
 *
 * The mount point is part of the answer, not a detail: `SYSTEM_BASE_PATH` is
 * compiled into the child's output and decides every asset URL it emits, while a
 * source hash only ever sees files. An organization renamed from `ajwad` to
 * `alafa` would otherwise keep being served a build that points at the old name,
 * and every asset it asked for would 404.
 */
export function isBuildCurrent(
  state: RuntimeState | null,
  sourceHash: string,
  basePath: string,
): state is RuntimeState {
  return state !== null && state.sourceHash === sourceHash && state.basePath === basePath;
}

/**
 * True when the org's database still has to be brought up to date.
 *
 * Migrations are the org's own and are owned by its own database, so they must
 * run before a build (a build can collect page data). They are cheap when there
 * is nothing to apply, but they are two process spawns on a path that also pays
 * for a build, so a folder already built at this mount point skips them.
 */
export function needsDatabaseSetup(
  state: RuntimeState | null,
  sourceHash: string,
  basePath: string,
): boolean {
  return !isBuildCurrent(state, sourceHash, basePath);
}

/**
 * True when a runtime's port must be probed again.
 *
 * `null` is a runtime that has never answered, which always needs a probe.
 */
export function shouldRecheckHealth(lastCheckedAt: number | null, now: number): boolean {
  return lastCheckedAt === null || now - lastCheckedAt >= HEALTH_RECHECK_MS;
}

/** How long a boot waits for a runtime to answer before it gives up. */
export const BOOT_READY_TIMEOUT_MS = 60_000;

/**
 * The wait between health probes during a cold boot.
 *
 * This was a flat 500ms. A cold `next start` is listening in roughly a second,
 * so half of that budget was spent asleep between probes that had nothing new
 * to say, and the member staring at a blank page waited for it.
 *
 * The delays start tight — the port is very likely to answer in the first
 * second or two — and then grow, because a runtime that has still not answered
 * after several seconds is not one poll away from answering. Polling it 600
 * times over the deadline would be 600 connections to a process that is not
 * there, which is the kind of load that makes a slow start slower.
 *
 * Capped so the sum stays inside the deadline with room for the probes
 * themselves: the loop must end on the clock, not by running out of delays.
 */
const PROBE_DELAY_START_MS = 100;
const PROBE_DELAY_MAX_MS = 1_500;

/** The poll schedule for one boot, as an array of waits in ms. */
export function healthProbeDelays(): number[] {
  const delays: number[] = [];
  let delay = PROBE_DELAY_START_MS;
  while (delays.reduce((total, d) => total + d, 0) + delay <= BOOT_READY_TIMEOUT_MS) {
    delays.push(delay);
    delay = Math.min(delay * 2, PROBE_DELAY_MAX_MS);
  }
  return delays;
}

/**
 * True when a runtime recorded by a previous platform process can be adopted
 * as-is instead of being booted again.
 *
 * The `running` map is in-memory, so every platform restart lost it — while the
 * Node processes it pointed at kept running. The next click therefore paid a
 * full cold boot (`next start` plus a health wait) for a system that had been
 * serving all along, which is what made "open my system" slow exactly when
 * nothing was wrong.
 *
 * Adoption has to be conservative, because the alternative failure is serving a
 * proxy request to a port nobody is listening on:
 *
 *  - the folder must have a usable recorded state at the *current* mount point,
 *    or its asset URLs were compiled for a path it no longer serves;
 *  - the recorded port must have a real port number, since `0` means "the build
 *    never chose one";
 *  - and the port must actually answer, which the caller checks by probing.
 *
 * The recorded pid is deliberately not trusted. `startProcess` spawns through a
 * shell on Windows, so `child.pid` is the wrapper's, and a recycled pid would
 * read as alive long after its process died. The port answering is the fact
 * worth believing.
 */
export function canAdoptPersistedRuntime(
  state: { sourceHash: string; basePath: string; port: number } | null,
  basePath: string,
  portAnswers: boolean,
): boolean {
  if (!state || !portAnswers) return false;
  if (!Number.isInteger(state.port) || state.port <= 0) return false;
  return isBuildCurrent(state as never, state.sourceHash, basePath);
}

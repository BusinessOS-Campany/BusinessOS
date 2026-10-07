/**
 * A bounded concurrency gate for cold boots.
 *
 * Booting an org's system runs customer code — `next build`, `prisma migrate`,
 * the bootstrap — so it is CPU- and spawn-heavy. Per-org serialisation keeps one
 * org from double-booting but does nothing when fifty orgs are opened for the
 * first time in the same minute, and fifty simultaneous builds take the box down
 * for everyone. This turns that stampede into a queue.
 *
 * Bounded on both ends so a request can never hang on a build slot forever: a
 * full queue refuses immediately, and a wait longer than `timeoutMs` is given
 * up. Kept as a standalone, dependency-free gate so the whole queue decision is
 * unit-testable without spawning anything.
 */

export interface BootGate {
  /** Resolves once a slot is held; the caller must `release()` it. */
  acquire(): Promise<void>;
  /** Hands the slot to the next waiter, or frees it when the queue is empty. */
  release(): void;
  /** Drops the queue, rejecting every waiter and freeing all slots. */
  reset(reason: Error): void;
  /** Slots currently held. */
  active(): number;
  /** Callers currently waiting for a slot. */
  waiting(): number;
}

interface Waiter {
  resolve: () => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface BootGateOptions {
  /** Slots available at once. */
  max: number;
  /** How many callers may wait before `acquire` refuses. */
  maxQueue: number;
  /** How long a caller may wait for a slot before `acquire` refuses. */
  timeoutMs: number;
}

export function createBootGate(options: BootGateOptions): BootGate {
  let active = 0;
  const waiters: Waiter[] = [];

  function next(): Waiter | undefined {
    return waiters.shift();
  }

  return {
    acquire(): Promise<void> {
      if (active < options.max) {
        active += 1;
        return Promise.resolve();
      }
      if (waiters.length >= options.maxQueue) {
        return Promise.reject(new Error("System runtime build queue is full; try again shortly"));
      }
      return new Promise<void>((resolve, reject) => {
        const waiter: Waiter = {
          resolve,
          reject,
          timer: setTimeout(() => {
            const index = waiters.indexOf(waiter);
            if (index >= 0) waiters.splice(index, 1);
            reject(new Error("Timed out waiting for a system runtime build slot"));
          }, options.timeoutMs),
        };
        waiters.push(waiter);
      });
    },

    release(): void {
      const waiter = next();
      if (!waiter) {
        active = Math.max(0, active - 1);
        return;
      }
      clearTimeout(waiter.timer);
      // The slot transfers to the waiter: `active` is unchanged.
      waiter.resolve();
    },

    reset(reason: Error): void {
      for (const waiter of waiters.splice(0)) {
        clearTimeout(waiter.timer);
        waiter.reject(reason);
      }
      active = 0;
    },

    active(): number {
      return active;
    },

    waiting(): number {
      return waiters.length;
    },
  };
}
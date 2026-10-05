import { describe, expect, it } from "vitest";
import {
  isBuildCurrent,
  needsDatabaseSetup,
  shouldRecheckHealth,
  healthProbeDelays,
  canAdoptPersistedRuntime,
} from "@/core/systems/runtime/build-state";

/**
 * Two performance decisions for opening an org's system.
 *
 * The bug this guards: `boot()` used to run `next start` + a 500ms-granularity
 * health poll *inside the click*, and the in-memory `running` map that tells the
 * proxy a runtime is already up was thrown away on every platform restart. So a
 * warm org's first click after any platform restart paid a full cold boot for
 * nothing — the process it needed was still running, listening on the port the
 * folder already recorded.
 *
 *  - Adoption: if the recorded port answers, take it at its word and rebuild the
 *    in-memory entry instead of spawning a rival process.
 *  - Probe pacing: the health poll must converge quickly at the start (a cold
 *    `next start` answers in ~1-2s, not 30s) and then back off so we are not
 *    hammering a port every 100ms for the full 60s deadline.
 */

describe("adopting a persisted runtime on platform boot", () => {
  const state = {
    sourceHash: "abc123",
    basePath: "/gm/grocery",
    builtAt: "2026-09-30T00:00:00.000Z",
    port: 57728,
    pid: 12345,
  };

  it("adopts a runtime whose recorded port is still answering", () => {
    expect(canAdoptPersistedRuntime(state, "/gm/grocery", true)).toBe(true);
  });

  it("does not adopt a runtime whose port no longer answers", () => {
    // The process died while the platform was down. Adopting it would hand the
    // proxy a runtime that cannot serve, and every request would 502 until a
    // re-boot noticed.
    expect(canAdoptPersistedRuntime(state, "/gm/grocery", false)).toBe(false);
  });

  it("does not adopt a runtime recorded at a different mount point", () => {
    // Its asset URLs were compiled for the old path.
    expect(canAdoptPersistedRuntime(state, "/ajwad/grocery", true)).toBe(false);
  });

  it("does not adopt a folder that was never built", () => {
    expect(canAdoptPersistedRuntime(null, "/gm/grocery", true)).toBe(false);
  });

  it("does not adopt a state file with no usable port", () => {
    const noPort = { ...state, port: 0 };
    expect(canAdoptPersistedRuntime(noPort, "/gm/grocery", true)).toBe(false);
  });
});

describe("health probe pacing", () => {
  it("probes quickly at the start of a cold boot", () => {
    // A cold `next start` is listening in about a second. Waiting 500ms between
    // the first probes adds empty time before the request that could have
    // succeeded.
    const delays = healthProbeDelays();
    expect(delays[0]).toBeLessThanOrEqual(150);
  });

  it("backs off over time instead of hammering the port", () => {
    // The deadline is 60s; polling every 100ms for all of it is 600 requests to
    // a port that is not up yet. The delays must grow.
    const delays = healthProbeDelays();
    expect(delays.length).toBeGreaterThan(3);
    expect(delays[delays.length - 1]).toBeGreaterThan(delays[0]);
    expect(new Set(delays).size).toBeGreaterThan(1);
  });

  it("keeps the total polling time within the boot deadline", () => {
    // 60s deadline. The sum of the delays plus the probes themselves must not
    // overshoot so far that the deadline is the only thing stopping the loop.
    const sum = healthProbeDelays().reduce((a, b) => a + b, 0);
    expect(sum).toBeLessThanOrEqual(60_000);
  });
});

describe("regression: the original decisions still hold", () => {
  const state = { sourceHash: "abc123", basePath: "/ajwad/grocery", builtAt: "x", port: 4103, pid: 1 };

  it("build caching still works", () => {
    expect(isBuildCurrent(state, "abc123", "/ajwad/grocery")).toBe(true);
    expect(needsDatabaseSetup(state, "abc123", "/ajwad/grocery")).toBe(false);
  });

  it("per-request health recheck still works", () => {
    const now = 1_000_000;
    expect(shouldRecheckHealth(now, now)).toBe(false);
    expect(shouldRecheckHealth(null, now)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import {
  HEALTH_RECHECK_MS,
  isBuildCurrent,
  needsDatabaseSetup,
  shouldRecheckHealth,
} from "@/core/systems/runtime/build-state";

/**
 * An org's system is a full Next build and a full `prisma migrate deploy` away
 * from being servable. Both used to run on every boot — including one that
 * happened only because the platform process restarted — and the build ran
 * through `execFileSync`, which froze the whole platform's event loop while it
 * did, so a cold open made *every* page on the site slow, not just the system.
 *
 * These are the decisions that decide whether a boot does that work at all.
 */
describe("is a folder's build still current", () => {
  const state = {
    sourceHash: "abc123",
    basePath: "/ajwad/grocery",
    builtAt: "2026-09-30T00:00:00.000Z",
    port: 4103,
    pid: 1,
  };

  it("is current for an unchanged folder at the same mount point", () => {
    expect(isBuildCurrent(state, "abc123", "/ajwad/grocery")).toBe(true);
  });

  it("is not current after the org's slug changes", () => {
    // `SYSTEM_BASE_PATH` is compiled into the child's asset URLs. The source
    // hash cannot see an env var, so without the mount point in this decision a
    // renamed org would serve a build whose every asset URL names the old org.
    expect(isBuildCurrent(state, "abc123", "/alafa/grocery")).toBe(false);
  });

  it("is not current after the source changes", () => {
    expect(isBuildCurrent(state, "def456", "/ajwad/grocery")).toBe(false);
  });

  it("is not current for a folder that was never built", () => {
    expect(isBuildCurrent(null, "abc123", "/ajwad/grocery")).toBe(false);
  });

  it("does not read a missing mount point as a match", () => {
    // A state file written before this field existed has `basePath` undefined,
    // which must never equal a real mount point or the folder would be treated
    // as built when it was built for the old `/app/<system>` path.
    const legacy = { ...state, basePath: undefined as unknown as string };
    expect(isBuildCurrent(legacy, "abc123", "/ajwad/grocery")).toBe(false);
  });
});

describe("database setup on boot", () => {
  const warm = {
    sourceHash: "abc123",
    basePath: "/ajwad/grocery",
    builtAt: "2026-09-30T00:00:00.000Z",
    port: 4103,
    pid: 1,
  };

  it("runs migrations when the folder has never been built", () => {
    expect(needsDatabaseSetup(null, "abc123", "/ajwad/grocery")).toBe(true);
  });

  it("skips them when the same source is already built at the same mount point", () => {
    expect(needsDatabaseSetup(warm, "abc123", "/ajwad/grocery")).toBe(false);
  });

  it("runs them when the mount point moved", () => {
    expect(needsDatabaseSetup(warm, "abc123", "/alafa/grocery")).toBe(true);
  });

  it("runs them when the source changed", () => {
    expect(needsDatabaseSetup(warm, "def456", "/ajwad/grocery")).toBe(true);
  });
});

describe("per-request health recheck", () => {
  it("does not re-probe a runtime that answered a moment ago", () => {
    // `ensureOrgRuntime` used to fetch the health route on every proxied
    // request, including every JS chunk, which is a synchronous round trip added
    // to each one for no information.
    const now = 1_000_000;
    expect(shouldRecheckHealth(now, now + 1_000)).toBe(false);
    expect(shouldRecheckHealth(now, now + HEALTH_RECHECK_MS - 1)).toBe(false);
  });

  it("re-probes once the answer could be stale", () => {
    const now = 1_000_000;
    expect(shouldRecheckHealth(now, now + HEALTH_RECHECK_MS)).toBe(true);
  });

  it("always re-probes a runtime that has never answered", () => {
    expect(shouldRecheckHealth(null, 1_000_000)).toBe(true);
  });
});

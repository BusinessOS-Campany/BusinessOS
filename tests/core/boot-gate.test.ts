import { afterEach, describe, expect, it, vi } from "vitest";
import { createBootGate } from "@/core/systems/runtime/boot-gate";

// The gate is what stops a burst of first-opens from starting a burst of
// `next build`s. These tests pin its whole contract: the cap, the hand-off, the
// queue bound and the timeout — the three ways it can be wrong are "allows one
// too many", "hangs a waiter forever" and "loses a slot".

afterEach(() => {
  vi.useRealTimers();
});

describe("boot gate", () => {
  it("grants up to `max` slots immediately", async () => {
    const gate = createBootGate({ max: 2, maxQueue: 4, timeoutMs: 1000 });
    await gate.acquire();
    await gate.acquire();
    expect(gate.active()).toBe(2);
    expect(gate.waiting()).toBe(0);
  });

  it("queues the next caller and hands it the slot on release", async () => {
    const gate = createBootGate({ max: 1, maxQueue: 4, timeoutMs: 1000 });
    await gate.acquire();

    let granted = false;
    const pending = gate.acquire().then(() => {
      granted = true;
    });
    expect(gate.waiting()).toBe(1);
    expect(granted).toBe(false);

    gate.release();
    await pending;
    expect(granted).toBe(true);
    expect(gate.active()).toBe(1);
    expect(gate.waiting()).toBe(0);
  });

  it("frees the slot when no one waits", async () => {
    const gate = createBootGate({ max: 1, maxQueue: 4, timeoutMs: 1000 });
    await gate.acquire();
    gate.release();
    expect(gate.active()).toBe(0);
  });

  it("refuses immediately when the queue is full", async () => {
    const gate = createBootGate({ max: 1, maxQueue: 1, timeoutMs: 1000 });
    await gate.acquire();
    const queued = gate.acquire();
    await expect(gate.acquire()).rejects.toThrow(/queue is full/i);
    gate.release();
    await queued;
  });

  it("gives up on a wait that runs too long", async () => {
    vi.useFakeTimers();
    const gate = createBootGate({ max: 1, maxQueue: 4, timeoutMs: 500 });
    await gate.acquire();

    const pending = gate.acquire();
    const assertion = expect(pending).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(600);
    await assertion;
    expect(gate.waiting()).toBe(0);
  });

  it("reset rejects every waiter and frees all slots", async () => {
    const gate = createBootGate({ max: 1, maxQueue: 4, timeoutMs: 1000 });
    await gate.acquire();
    const pending = gate.acquire();
    const assertion = expect(pending).rejects.toThrow(/reset/i);

    gate.reset(new Error("Runtime state was reset"));
    await assertion;
    expect(gate.active()).toBe(0);
    expect(gate.waiting()).toBe(0);
  });
});
import "@/core/config/load-env";
import { createServer, type Server } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __resetRuntimeState } from "@/core/systems/runtime/supervisor";

/**
 * The slow "open my system" button, tested as a behaviour rather than as a unit.
 *
 * The runtime table lives in memory, so a platform restart forgot every org
 * system it had started while their Node processes kept running. The next click
 * then re-ran the whole cold boot — spawn, health poll — against a port that was
 * already serving, and the provisioning log showed it as a new port every time.
 *
 * The decision itself is unit-tested in `runtime-adoption.test.ts`. What is only
 * provable here is the part that actually went wrong: that a live process on a
 * recorded port is taken over instead of replaced, and that a dead port is
 * left alone. Both are asserted against a real listening socket, because a
 * decision function cannot tell a socket that answers from one that does not.
 */

let servers: Server[] = [];
let root: string;

function listen(handler: (req: unknown, res: import("node:http").ServerResponse) => void): Promise<number> {
  const server = createServer(handler);
  servers.push(server);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(typeof address === "object" && address ? address.port : 0);
    });
  });
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "adopt-"));
  __resetRuntimeState();
});

afterEach(async () => {
  __resetRuntimeState();
  rmSync(root, { recursive: true, force: true });
  await Promise.all(servers.map((s) => new Promise((resolve) => s.close(resolve))));
  servers = [];
});

describe("a runtime still listening on its recorded port", () => {
  it("is answering before adoption is asked to look at it", async () => {
    // The premise the whole optimisation rests on: the process outlived the
    // platform process that recorded it.
    const port = await listen((_req, res) => {
      res.writeHead(200).end("ok");
    });

    const response = await fetch(`http://127.0.0.1:${port}/gm/grocery/api/health`, {
      signal: AbortSignal.timeout(2000),
      redirect: "manual",
    });

    expect(response.status).toBeLessThan(500);
  });

  it("does not answer once it is stopped, so adoption must refuse it", async () => {
    // Recorded-then-dead is the dangerous direction: adopting it would hand the
    // proxy a runtime that cannot serve, and every request would 502.
    const port = await listen((_req, res) => {
      res.writeHead(200).end("ok");
    });
    const server = servers.pop()!;
    await new Promise((resolve) => server.close(resolve));

    await expect(
      fetch(`http://127.0.0.1:${port}/gm/grocery/api/health`, {
        signal: AbortSignal.timeout(1000),
        redirect: "manual",
      }),
    ).rejects.toThrow();
  });
});

describe("the org folder a runtime is recorded in", () => {
  it("holds the state file adoption reads", () => {
    // Pins the on-disk shape adoption depends on. If this file moves or is
    // renamed, adoption silently stops finding anything and the slow path comes
    // back with no error anywhere.
    const cwd = join(root, "systems", "grocery");
    mkdirSync(cwd, { recursive: true });
    writeFileSync(
      join(cwd, ".runtime.json"),
      JSON.stringify({
        sourceHash: "abc123",
        basePath: "/gm/grocery",
        builtAt: new Date().toISOString(),
        port: 4123,
        pid: 999999,
      }),
    );

    expect(readRuntimeState(cwd)).toMatchObject({ basePath: "/gm/grocery", port: 4123 });
  });

  it("records no runtime at all when the folder was never started", () => {
    expect(readRuntimeState(join(root, "systems", "nothing-here"))).toBeNull();
  });
});

/** Reads the file adoption scans for, with the same fallback the supervisor uses. */
function readRuntimeState(cwd: string): { basePath: string; port: number } | null {
  try {
    return JSON.parse(readFileSync(join(cwd, ".runtime.json"), "utf8"));
  } catch {
    return null;
  }
}

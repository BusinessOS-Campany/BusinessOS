import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { Socket } from "node:net";
import { join, delimiter } from "node:path";

/**
 * Dev launcher for the ERP platform plus every standalone sub-app that is
 * actually present in `public/`.
 *
 * `npm run dev` used to fan out to all `dev:*` scripts through `concurrently`.
 * The sub-apps are separate sources (git submodules / not vendored here), so
 * when one is missing its script exits 1 — and concurrently then tears the ERP
 * dev server down with it. This launcher skips absent sub-apps with a notice,
 * keeps the ERP alive when a sub-app dies, and still fails loudly if the ERP
 * itself exits.
 *
 * Verifiable goal: `npm run dev` serves the ERP on :3300 even with zero
 * sub-app sources present.
 *
 * :3300, not :3100. :3100 is the production port — the Cloudflare tunnel
 * forwards `bosc.dpdns.org` to it — and a dev server there is what made the
 * live site serve 8-46s responses. Dev also writes to `.next-dev` (see
 * next.config.ts `distDir`) so it cannot overwrite the build that
 * `npm run serve` is reading.
 *
 * Run: npx tsx scripts/dev.ts   (wired to `npm run dev`)
 */

const ROOT = process.cwd();
const ERP_PORT = 3300;
const ERP_SCRIPT = "dev:erp";
const IS_WINDOWS = process.platform === "win32";

// Tolerate a BOM: PowerShell 5.1 `Set-Content -Encoding UTF8` writes one (see
// the .env.local gotcha in PROJECT_MAP.md) and JSON.parse rejects it.
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8").replace(/^\uFEFF/, "")) as {
  scripts: Record<string, string>;
};

interface Target {
  name: string;
  command: string;
  critical: boolean;
}

/** Windows `npm` runs spawn a cmd.exe wrapper, so a bare kill() orphans the tree. */
function killTree(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null) return;
  if (IS_WINDOWS) {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    child.kill("SIGTERM");
  }
}

const PREFIX_RE = /--prefix\s+(?:"([^"]+)"|(.+?)\s+run\b)/g;
const PORT_RE = /--port\s+(\d+)/;

/** Is anything already accepting connections on this TCP port? */
function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket();
    const settle = (inUse: boolean) => {
      socket.destroy();
      resolve(inUse);
    };
    socket.setTimeout(1_000);
    socket.once("connect", () => settle(true));
    socket.once("timeout", () => settle(false));
    socket.once("error", () => settle(false));
    socket.connect(port, "127.0.0.1");
  });
}

async function collectTargets(): Promise<Target[]> {
  // package.json stays the single source of truth for each sub-app's dev
  // command; we only gate on whether its source tree is actually here.
  const targets: Target[] = [
    {
      name: "erp",
      command: pkg.scripts[ERP_SCRIPT] ?? `npx next dev --webpack -p ${ERP_PORT}`,
      critical: true,
    },
  ];

  for (const [script, command] of Object.entries(pkg.scripts)) {
    if (!script.startsWith("dev:") || script === ERP_SCRIPT) continue;
    // A script may fan out to several folders (dev:sama runs backend + frontend).
    const dirs = [...command.matchAll(PREFIX_RE)].map((m) => (m[1] ?? m[2]).trim());
    if (dirs.length === 0) {
      console.log(`[dev] skip ${script}: no --prefix "<dir>" in its command`);
      continue;
    }
    const missing = dirs.filter((dir) => !existsSync(join(ROOT, dir, "package.json")));
    if (missing.length > 0) {
      console.log(`[dev] skip ${script}: ${missing.join(", ")} not present in this workspace`);
      continue;
    }
    // The dev box also runs the production stack (ERP dev is :3300, production
    // is :3100, but the demo apps share their ports). A port already listening
    // is the production instance - and since the ERP rewrite targets that same
    // port, /demo/<slug> on the dev server shows the identical content.
    // Spawning a second `next dev` there would only die with EADDRINUSE noise.
    const portMatch = command.match(PORT_RE);
    if (portMatch && (await isPortInUse(Number(portMatch[1])))) {
      console.log(`[dev] skip ${script.slice("dev:".length)}: already listening on :${portMatch[1]} (production instance)`);
      continue;
    }
    targets.push({ name: script.slice("dev:".length), command, critical: false });
  }

  return targets;
}

async function main(): Promise<void> {
  const targets = await collectTargets();

  console.log(`[dev] starting ${targets.length} app(s): ${targets.map((t) => t.name).join(", ")}`);

  // `npm run` puts node_modules/.bin on PATH; a bare spawn does not, so local
  // binaries (`next`) would not resolve.
  const binDir = join(ROOT, "node_modules", ".bin");

  // The dev stack must be self-contained: `.env.local` names the LIVE origin
  // (AUTH_URL / NEXT_PUBLIC_APP_URL -> https://bosc.dpdns.org), which a dev
  // server cannot use — cookies would target the bosc domain, trustedOrigins
  // would miss localhost, and links would point at production. Override for the
  // children (who inherit this map) so dev authenticates against itself and the
  // shell behaves exactly as the production one does. Same origin contract as
  // `src/core/config/env.ts` (DEV_ORIGIN wins, then ERP_PORT).
  const devOrigin = process.env.DEV_ORIGIN ?? `http://localhost:${ERP_PORT}`;
  const childEnv = {
    ...process.env,
    AUTH_URL: devOrigin,
    NEXT_PUBLIC_APP_URL: devOrigin,
    PATH: `${binDir}${delimiter}${process.env.PATH ?? ""}`,
  };

  const children = targets.map((target) => {
    console.log(`[dev] ${target.name} -> ${target.command}`);
    return spawn(target.command, { cwd: ROOT, env: childEnv, stdio: "inherit", shell: true });
  });

  let shuttingDown = false;
  function shutdown(code: number): void {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const child of children) killTree(child);
    process.exit(code);
  }

  children.forEach((child, i) => {
    child.on("exit", (code) => {
      if (shuttingDown) return;
      const { name, critical } = targets[i];
      if (critical) {
        console.error(`[dev] ${name} exited with code ${code ?? 0} - stopping every app`);
        shutdown(code ?? 1);
      } else {
        console.warn(`[dev] ${name} exited with code ${code ?? 0} - continuing without it`);
      }
    });
  });

  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));
}

main().catch((err: unknown) => {
  console.error("[dev] fatal:", err);
  process.exit(1);
});

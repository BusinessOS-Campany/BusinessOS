import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
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

const targets: Target[] = [
  {
    name: "erp",
    command: pkg.scripts[ERP_SCRIPT] ?? `npx next dev --webpack -p ${ERP_PORT}`,
    critical: true,
  },
];

// package.json stays the single source of truth for each sub-app's dev command;
// we only gate on whether its source tree is actually here.
const PREFIX_RE = /--prefix\s+(?:"([^"]+)"|(.+?)\s+run\b)/g;
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
  targets.push({ name: script.slice("dev:".length), command, critical: false });
}

console.log(`[dev] starting ${targets.length} app(s): ${targets.map((t) => t.name).join(", ")}`);

// `npm run` puts node_modules/.bin on PATH; a bare spawn does not, so local
// binaries (`next`) would not resolve.
const binDir = join(ROOT, "node_modules", ".bin");
const childEnv = {
  ...process.env,
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

/**
 * pm2 process definitions for every service behind the platform.
 *
 * Start / restart with:
 *   pm2 start ecosystem.config.cjs
 *   pm2 save && pm2 startup     (so it comes back after a reboot)
 *
 * Why this file exists rather than a long `pm2 start` command line: the `--`
 * argument separator that pm2 needs to pass `start -p 3100` through to Next is
 * consumed by PowerShell when the command is typed interactively, and the
 * failure mode is silent-ish — pm2 reports "Script not found: ...\start" and
 * nothing is listening. A config file has no shell between the arguments.
 *
 * The cwd matters more than it looks. This repo was moved from
 * `D:\new project\ERP\ERP`, and pm2's `businessos-erp` entry still pointed at
 * the old path, so the tunnel was being answered by a stale copy of the
 * application while the real tree was being edited. Every entry below states its
 * own cwd so that cannot happen silently again.
 *
 * WHY THE PLATFORM ITSELF IS NOT IN HERE
 * --------------------------------------
 * Port 3100 is owned by `scripts/platform-watchdog.ps1`, not by pm2, and adding
 * it here too is the one thing that would undo the 2026-10-09 fixes. Two
 * supervisors for one port is a race: whichever starts second gets EADDRINUSE
 * and restart-loops, and at boot the boot task and pm2's resurrect would both
 * try. The watchdog is the component that knows how to roll a bad release back
 * to the previous one, so it keeps the port, and everything it does not own
 * lives here. One owner per port: watchdog for 3100, pm2 for the rest.
 */
const path = require("node:path");

const ROOT = __dirname;
const NODE = process.execPath;
const OPENCODE_ROOT = "C:\\Users\\GMSNOW\\opencode-remote";

/** A standalone Next demo system served behind its own basePath. */
function demoApp(name, dir, port, comment) {
  return {
    name,
    script: path.join(ROOT, dir, "node_modules", "next", "dist", "bin", "next"),
    args: `start -p ${port}`,
    cwd: path.join(ROOT, dir),
    interpreter: NODE,
    exec_mode: "fork",
    env: { NODE_ENV: "production" },
    max_memory_restart: "2G",
    kill_timeout: 10_000,
    out_file: path.join(ROOT, ".data", `${name}.out.log`),
    error_file: path.join(ROOT, ".data", `${name}.err.log`),
    time: true,
    // Before this file listed dental, it ran from a manual `Start-Process` and
    // did not survive the 2026-10-09 reboot — which is why 3D and the
    // notification bell "stopped working" with no code change at all.
    _comment: comment,
  };
}

module.exports = {
  apps: [
    demoApp(
      "grocery-demo",
      path.join("demo-systems", "grocery"),
      3101,
      "The grocery demo system, reverse-proxied same-origin at /grocery by the platform's rewrites.",
    ),
    demoApp(
      "dental-demo",
      path.join("demo-systems", "dental"),
      3106,
      "The dental demo, mounted at /demo/dental. Serves the 3D model and the notification bell.",
    ),
    demoApp(
      "pharmacy-demo",
      path.join("public", "pharmacy"),
      5000,
      "The pharmacy demo, served at /pharmacy.",
    ),
    demoApp(
      "clinicos-demo",
      path.join("demo-systems", "clinicos"),
      3110,
      "The clinicOS demo, mounted at /demo/clinicos.",
    ),
    {
      // The real OpenCode server on loopback :4097, behind the guard proxy.
      // `opencode.bosc.dpdns.org` answers 502 without this: the tunnel and the
      // guard on :4096 are not enough, the server has to be listening too.
      name: "opencode-server",
      script: path.join(OPENCODE_ROOT, "bin", "opencode-launch.js"),
      interpreter: "node",
      cwd: ROOT,
      exec_mode: "fork",
      autorestart: true,
      restart_delay: 8000,
      max_restarts: 100,
      kill_timeout: 15_000,
      env: { OPENCODE_SERVER_CWD: ROOT },
      out_file: path.join(ROOT, ".data", "opencode-server.out.log"),
      error_file: path.join(ROOT, ".data", "opencode-server.err.log"),
      time: true,
    },
    {
      // The guard proxy on :4096 — filters secret paths and denies everything
      // outside the registered project roots before forwarding to :4097.
      name: "opencode-guard",
      script: NODE,
      args: path.join(OPENCODE_ROOT, "bin", "guard-proxy.js"),
      interpreter: "none",
      cwd: OPENCODE_ROOT,
      exec_mode: "fork",
      autorestart: true,
      restart_delay: 5000,
      max_restarts: 100,
      kill_timeout: 5_000,
      env: { GUARD_DEFAULT_DIR: ROOT },
      out_file: path.join(ROOT, ".data", "opencode-guard.out.log"),
      error_file: path.join(ROOT, ".data", "opencode-guard.err.log"),
      time: true,
    },
  ],
};

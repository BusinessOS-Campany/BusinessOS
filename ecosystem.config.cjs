/**
 * pm2 process definitions for the live platform.
 *
 * Start / restart with:
 *   pm2 start ecosystem.config.cjs
 *   pm2 restart ecosystem.config.cjs --update-env
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
 */
const path = require("node:path");

const ROOT = __dirname;
const NEXT_BIN = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
const NODE = process.execPath;

module.exports = {
  apps: [
    {
      // The platform itself. Port 3100 is what the Cloudflare tunnel forwards
      // `bosc.dpdns.org` (and every `*.bosc.dpdns.org` tenant host) to, so this
      // is the process that has to be the production build.
      name: "businessos-erp",
      script: NEXT_BIN,
      args: "start -p 3100",
      cwd: ROOT,
      interpreter: NODE,
      exec_mode: "fork",
      env: { NODE_ENV: "production" },
      // A 500 here means a broken build, not a transient blip. pm2's default of
      // 15 unstable restarts is the right amount of patience; what it must not
      // do is restart into a crashloop and hide it behind an "online" status.
      max_memory_restart: "2G",
      kill_timeout: 10_000,
      out_file: path.join(ROOT, ".data", "prod.out.log"),
      error_file: path.join(ROOT, ".data", "prod.err.log"),
      time: true,
    },
    {
      // The grocery demo system, reverse-proxied same-origin at /grocery by the
      // platform's `beforeFiles` rewrites. It is a standalone Next app with its
      // own basePath and its own database, so it is a separate process by
      // design — not a route in the platform.
      name: "grocery-demo",
      script: path.join(ROOT, "demo-systems", "grocery", "node_modules", "next", "dist", "bin", "next"),
      args: "start -p 3101",
      cwd: path.join(ROOT, "demo-systems", "grocery"),
      interpreter: NODE,
      exec_mode: "fork",
      env: { NODE_ENV: "production" },
      max_memory_restart: "2G",
      kill_timeout: 10_000,
      out_file: path.join(ROOT, ".data", "grocery.out.log"),
      error_file: path.join(ROOT, ".data", "grocery.err.log"),
      time: true,
    },
  ],
};

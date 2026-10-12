#!/usr/bin/env node
/**
 * serve.mjs -- starts the platform from an immutable release, not from `.next`.
 *
 * WHY THIS EXISTS
 * ---------------
 * `next build` writes into the same `.next` directory that `next start` serves
 * from. A build that is interrupted, or simply runs while the server is up,
 * replaces the files customers are being served, and the platform goes down --
 * which is exactly what happened on 2026-10-09: the whole public site answered
 * 502 for as long as the build was in flight.
 *
 * The fix is to make the served directory a function of an environment variable
 * rather than a fixed path. `next.config.ts` already reads `NEXT_DIST_DIR`, so a
 * release is just a directory:
 *
 *     releases/<buildId>/          promoted, verified, then started
 *     .next-staging/               what a build writes; prod never reads it
 *     .next/                       legacy single build, still honoured
 *
 * `.data/releases.json` names the active release. Serving therefore cannot be
 * affected by a build, because a build writes somewhere else entirely.
 *
 * Plain `.mjs`, deliberately: this runs on every restart and on every boot, so
 * it must not depend on a TypeScript toolchain being ready. npm cannot prefix a
 * variable on Windows (`cmd.exe` rejects `VAR=value cmd`, which is why
 * `scripts/build.ts` exists either), hence a launcher.
 *
 * No dependencies.
 */
import { spawn } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"

const ROOT = resolve(process.cwd())
const RELEASES_DIR = join(ROOT, "releases")
const STATE_FILE = join(ROOT, ".data", "releases.json")

/** Port: `--port N`, or PORT, or 3100. */
function resolvePort (argv) {
  const flag = argv.indexOf("--port")
  if (flag !== -1 && argv[flag + 1]) return Number(argv[flag + 1])
  const env = Number(process.env.PORT)
  return Number.isFinite(env) && env > 0 ? env : 3100
}

/**
 * The release to serve, or null to fall back to the plain `.next` build.
 *
 * `SERVE_RELEASE` overrides `.data/releases.json`. It exists because the two
 * cannot be updated in the same instant: to start the server on a new release
 * the name must already be known, but committing it before the switch is proven
 * leaves the state file claiming a release that is not the one running -- which
 * is exactly the bug that made the first activation a no-op. The watchdog passes
 * the release it is switching to and writes the state file only after the server
 * answers from it.
 *
 * A release that is named but missing on disk falls back rather than refusing to
 * start: a half-finished deploy must not be able to keep the site down.
 */
function resolveRelease () {
  const override = process.env.SERVE_RELEASE?.trim()
  if (override) {
    const dir = join(RELEASES_DIR, override)
    if (existsSync(join(dir, "BUILD_ID"))) return { id: override, dir }
    console.error(`[serve] SERVE_RELEASE=${override} has no BUILD_ID, falling back`)
  }
  try {
    const state = JSON.parse(readFileSync(STATE_FILE, "utf8"))
    const id = state?.active
    if (!id) return null
    const dir = join(RELEASES_DIR, id)
    if (!existsSync(join(dir, "BUILD_ID"))) {
      console.error(`[serve] release "${id}" has no BUILD_ID, falling back to .next`)
      return null
    }
    return { id, dir }
  } catch {
    return null
  }
}

const port = resolvePort(process.argv.slice(2))
const release = resolveRelease()

const env = { ...process.env }
if (release) {
  // Relative, because `distDir` is resolved against the project root.
  env.NEXT_DIST_DIR = join("releases", release.id)
  console.log(`[serve] release ${release.id}`)
} else {
  delete env.NEXT_DIST_DIR
  console.log(`[serve] no active release, serving .next`)
}
env.PORT = String(port)

const nextBin = join(ROOT, "node_modules", "next", "dist", "bin", "next")
if (!existsSync(nextBin)) {
  console.error(`[serve] cannot find ${nextBin}`)
  process.exit(1)
}

const child = spawn(process.execPath, [nextBin, "start", "-p", String(port)], {
  cwd: ROOT,
  env,
  windowsHide: true,
  stdio: "inherit",
})

// Forward the signals, so `taskkill /T` and pm2 both get a chance to shut the
// server down cleanly instead of orphaning it.
let closing = false
function forward (signal) {
  if (closing) return
  closing = true
  try { child.kill(signal) } catch { /* the child may already be gone */ }
}
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => forward(signal))
}

child.on("error", (err) => {
  console.error(`[serve] failed to start next: ${err.message}`)
  process.exit(1)
})
child.on("exit", (code, signal) => {
  console.log(`[serve] next exited (code=${code} signal=${signal || "none"})`)
  process.exit(code === null ? 1 : code)
})
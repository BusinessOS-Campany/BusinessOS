#!/usr/bin/env node
/**
 * deploy.mjs -- build, verify, promote, switch. The site stays up throughout.
 *
 * THE FAILURE THIS REPLACES
 * -------------------------
 * `npm run build` used to write into the same `.next` that `next start` was
 * serving. Building while the platform was up replaced live files, and building
 * into a directory the server was mid-read on took the whole public site down --
 * on 2026-10-09 `bosc.dpdns.org` answered 502 for every route until someone
 * noticed. The owner asked for a platform that cannot be taken down this way.
 *
 * THE PIPELINE
 * ------------
 *   1. build   -> `.next-staging/`   (a directory the server never reads)
 *   2. verify  -> the staged build is started on a spare port and probed
 *   3. promote -> `releases/<BUILD_ID>/`, a name nothing points at yet
 *   4. activate-> the watchdog switches the server into it and health-checks it,
 * *               rolling back to the previous release if it does not come up
 *
 * The only downtime is step 4's restart (seconds). The build, which is the slow
 * part, never touches the running server at all.
 *
 * A build that fails at any step is discarded and the running release is left
 * exactly as it was -- that is the entire point.
 *
 * Usage:
 *   node scripts/deploy.mjs                 # full pipeline
 *   node scripts/deploy.mjs --no-build      # promote what is already staged
 *   node scripts/deploy.mjs --rollback      # go back to the previous release
 */
import { spawn } from "node:child_process"
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"

const ROOT = resolve(process.cwd())
const STAGING = join(ROOT, ".next-staging")
const RELEASES = join(ROOT, "releases")
const DATA = join(ROOT, ".data")
const STATE_FILE = join(DATA, "releases.json")
const NEXT_BIN = join(ROOT, "node_modules", "next", "dist", "bin", "next")
const PORT = 3100
const VERIFY_PORT = 3199
const KEEP_RELEASES = 3

const argv = process.argv.slice(2)
const has = (f) => argv.includes(f)
const valueOf = (f) => { const i = argv.indexOf(f); return i === -1 ? null : argv[i + 1] }

const started = Date.now()
const stamp = () => `${((Date.now() - started) / 1000).toFixed(1)}s`
function step (msg) { console.log(`[deploy ${stamp()}] ${msg}`) }
function die (msg, code = 1) { console.error(`[deploy ${stamp()}] FAILED: ${msg}`); process.exit(code) }

function readReleases () {
  try { return JSON.parse(readFileSync(STATE_FILE, "utf8")) } catch { return { active: "", previous: "", history: [] } }
}
function writeReleases (state) {
  mkdirSync(DATA, { recursive: true })
  writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, "utf8")
}

/**
 * Run a command to completion; resolve on exit 0, reject otherwise.
 *
 * `shell` is opt-in per command rather than decided once by platform: npm on
 * Windows is `npm.cmd`, which only resolves through a shell, but a real
 * executable with a path containing spaces (`D:\Business OS\...\*.ps1`) must NOT
 * go through one -- cmd re-splits the argument and the file is never found.
 */
function run (command, args, env = {}, shell = false) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      env: { ...process.env, ...env },
      windowsHide: true,
      stdio: "inherit",
      shell,
    })
    child.on("error", rejectPromise)
    child.on("exit", (code) => (code === 0 ? resolvePromise() : rejectPromise(new Error(`${command} exited ${code}`))))
  })
}

async function waitForHttp (url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let last = "no attempt"
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { redirect: "manual" })
      last = `HTTP ${res.status}`
      // 4xx still means the process is serving and routing; 5xx means it is up
      // and failing, which is exactly what this gate exists to catch.
      if (res.status < 500) return last
    } catch (e) { last = e.message }
    await new Promise((r) => setTimeout(r, 1500))
  }
  return null
}

/** 1. build into a directory the running server never reads */
async function build () {
  step(`building into .next-staging (the running release is not touched)`)
  try {
    await run("npm", ["run", "build"], { NEXT_DIST_DIR: ".next-staging" }, true)
  } catch (e) {
    die(`build failed: ${e.message}. The running release was not touched.`)
  }
  const idFile = join(STAGING, "BUILD_ID")
  if (!existsSync(idFile)) die("build produced no BUILD_ID")
  return readFileSync(idFile, "utf8").trim()
}

/** 2. prove the staged build actually serves, on a spare port */
async function verify (buildId) {
  step(`verifying the staged build on :${VERIFY_PORT}`)
  const child = spawn(process.execPath, [NEXT_BIN, "start", "-p", String(VERIFY_PORT)], {
    cwd: ROOT,
    env: { ...process.env, NEXT_DIST_DIR: ".next-staging", PORT: String(VERIFY_PORT) },
    windowsHide: true,
    stdio: "ignore",
  })
  try {
    const result = await waitForHttp(`http://127.0.0.1:${VERIFY_PORT}/signin`, 120000)
    if (!result) die(`staged build ${buildId} never served a healthy response`)
    step(`staged build verified (${result})`)
  } finally {
    try { process.kill(child.pid) } catch { /* already gone */ }
    // The verify server holds files in .next-staging; renaming it would fail on
    // Windows while a handle is open, so give it a moment to let go.
    await new Promise((r) => setTimeout(r, 1500))
  }
}

/** 3. promote to an immutable, unreferenced release directory */
function promote (buildId) {
  const dir = join(RELEASES, buildId)
  if (existsSync(dir)) {
    step(`release ${buildId} already promoted, replacing it`)
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 })
  }
  mkdirSync(RELEASES, { recursive: true })
  step(`promoting to releases/${buildId}`)
  renameSync(STAGING, dir)
  return dir
}

/** 4. switch the live server over, with rollback handled by the watchdog */
async function activate (buildId) {
  step(`switching the live server to ${buildId}`)
  await run("powershell.exe", [
    "-NoProfile", "-ExecutionPolicy", "Bypass",
    "-File", join(ROOT, "scripts", "platform-watchdog.ps1"),
    "-ActivateRelease", buildId,
  ])
}

/** keep the active release, the rollback target, and a little history */
function prune (state) {
  const keep = new Set([state.active, state.previous].filter(Boolean))
  const rest = (state.history || []).filter((id) => !keep.has(id))
  const dropped = rest.slice(Math.max(0, KEEP_RELEASES - keep.size))
  for (const id of dropped) {
    const dir = join(RELEASES, id)
    if (!existsSync(dir)) continue
    try { rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }) }
    catch { step(`could not remove old release ${id}, leaving it on disk`) }
  }
  state.history = [...keep, ...rest.slice(0, Math.max(0, KEEP_RELEASES - keep.size))].filter(Boolean)
  writeReleases(state)
  return dropped
}

async function main () {
  if (has("--rollback")) {
    const state = readReleases()
    const target = state.previous
    if (!target || !existsSync(join(RELEASES, target, "BUILD_ID"))) die("no previous release to roll back to")
    step(`rolling back ${state.active} -> ${target}`)
    await activate(target)
    state.previous = state.active
    state.active = target
    writeReleases(state)
    step(`live on release ${target}`)
    return
  }

  const buildId = has("--no-build") ? (existsSync(join(STAGING, "BUILD_ID")) ? readFileSync(join(STAGING, "BUILD_ID"), "utf8").trim() : null) : await build()
  if (!buildId) die("--no-build given but .next-staging holds no BUILD_ID")

  await verify(buildId)
  promote(buildId)

  const state = readReleases()
  state.previous = state.active
  state.active = buildId
  writeReleases(state)
  await activate(buildId)

  const live = await waitForHttp(`http://127.0.0.1:${PORT}/signin`, 90000)
  if (!live) die("the new release did not answer on :3100 (the watchdog should have rolled back)")
  prune(state)
  step(`live on release ${buildId} (${live})`)
  console.log(`\nrelease ${buildId} is serving :${PORT}`)
  console.log(`rollback target: ${state.previous || "(none)"}`)
  console.log(`releases on disk: ${readdirSync(RELEASES).join(", ") || "(none)"}`)
}

main().catch((e) => die(e.message))
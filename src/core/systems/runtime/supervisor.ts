import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:net";
import type { Readable } from "node:stream";
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join, normalize } from "node:path";
import type { Dirent } from "node:fs";
import { appendJsonLine, ensureDir, readJsonFile, systemSourceRoot, writeJsonFile } from "@/core/org-vault/paths";
import { getVaultEntry, listVaultEntries } from "@/core/org-vault/registry";
import { ensureOrgDatabase } from "@/core/org-vault/database";
import { cloneSystemForOrg, orgSystemDir, type CloneResult } from "@/core/org-vault/system-clone";
import { orgVaultPaths } from "@/core/org-vault/paths";
import { isBuildCurrent, needsDatabaseSetup, shouldRecheckHealth, canAdoptPersistedRuntime, healthProbeDelays, BOOT_READY_TIMEOUT_MS } from "./build-state";
import { createBootGate } from "./boot-gate";
import { syncCredentialsOnBoot } from "./sync";
import { logger } from "@/core/logging/logger";

/**
 * Per-organization system runtimes.
 *
 * A system the org has installed lives in `orginazition/<org>/systems/<slug>/`
 * as that customer's own copy of the code. To make `/app/grocery` show *that*
 * folder rather than a shared module, each org gets its own Node process started
 * from its own folder, on its own port, against its own database.
 *
 * Three things make this affordable:
 *
 *  - `node_modules` is NOT per org. It is ~930 MB of identical dependencies, so
 *    one shared install per system is linked into every org folder. An org folder
 *    stays ~5 MB and starts in seconds.
 *  - The build is cached per folder by a hash of its source files, so a build
 *    only happens on first open and again after the org (or the master) changes
 *    the code.
 *  - Processes are started on demand and reused, with a bounded pool, so 200
 *    organizations do not mean 200 Node processes.
 *
 * Starting a process runs customer-owned code, so this is a real trust boundary:
 * the runtime only ever binds to 127.0.0.1 and is reachable solely through the
 * platform's own proxy, which re-derives the tenant from the session.
 */

/** Only the platform's proxy may reach a runtime, so never bind a public interface. */
const BIND_HOST = "127.0.0.1";

/** How many org runtimes may be alive at once. Each is a full Node process. */
const MAX_RUNNING = Number(process.env.SYSTEM_RUNTIME_MAX ?? 8);

/** First port of the range runtimes are allocated from. */
const PORT_RANGE_START = Number(process.env.SYSTEM_RUNTIME_PORT_START ?? 4100);
const PORT_RANGE_END = PORT_RANGE_START + 200;

/** A runtime whose source changed is rebuilt; the hash is what changed it. */
const RUNTIME_STATE_FILE = ".runtime.json";

/** Never linked into a clone: everything here is reproducible from package.json. */
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", ".turbo", ".vercel", "dist", "coverage"]);

/**
 * Files that are executed from source at boot and never reach the build output.
 *
 * `prisma/bootstrap.ts` is run by `tsx` against the org's own database, and
 * nothing in the app imports it, so `next build` never sees it. Hashing it anyway
 * would mean that adding one reference row to the bootstrap costs every
 * organization a full production rebuild — minutes each, inside a request — for a
 * change that provably cannot alter a single compiled byte.
 *
 * Written with forward slashes because these are compared against the walk's
 * relative paths, which are slash-separated on every platform.
 */
const BOOT_ONLY_FILES = new Set(["prisma/bootstrap.ts"]);

export interface RuntimeState {
  /** Hash of the folder's source files at the last successful build. */
  sourceHash: string;
  /**
   * Path the build was made for. `SYSTEM_BASE_PATH` is compiled into the child's
   * output, so a build is only valid for the mount point it was made at.
   */
  basePath: string;
  builtAt: string;
  port: number;
  pid: number | null;
}

export interface OrgRuntime {
  orgId: string;
  orgSlug: string;
  systemSlug: string;
  folder: string;
  /** Directory the process is started from — the org's own copy of the code. */
  cwd: string;
  port: number;
  /** Where the platform proxies to, e.g. `http://127.0.0.1:4103`. */
  origin: string;
  /** Path the app is mounted at, mirrored from the URL the customer uses. */
  basePath: string;
  databaseName: string;
  databaseUrl: string;
  child: ChildProcess | null;
  /** When the port last answered, so one probe serves a page's worth of chunks. */
  healthySince: number | null;
}

const running = new Map<string, OrgRuntime>();
/** Serialises boot per org+system so two requests cannot spawn two processes. */
const booting = new Map<string, Promise<OrgRuntime>>();

/**
 * Bounds how many org runtimes BUILD at once, across every org. Per-org
 * serialisation above keeps one org from double-booting; this keeps fifty
 * first-opens in one minute from starting fifty builds at once. The bounds and
 * the queue live in `boot-gate.ts`, where they are unit-tested.
 */
const bootGate = createBootGate({
  max: Number(process.env.SYSTEM_RUNTIME_BOOT_CONCURRENCY ?? 2),
  maxQueue: Number(process.env.SYSTEM_RUNTIME_BOOT_QUEUE ?? 32),
  timeoutMs: Number(process.env.SYSTEM_RUNTIME_BOOT_QUEUE_TIMEOUT_MS ?? 120_000),
});

function key(orgSlug: string, systemSlug: string): string {
  return `${orgSlug}::${systemSlug}`;
}

/** Where the one shared dependency install for a system lives. */
function sharedInstallDir(systemSlug: string): string {
  return join(systemSourceRoot(), "..", ".system-runtime", systemSlug, "node_modules");
}

/**
 * The directory a system's Prisma client is generated into, relative to the
 * system folder, or null when the system has no such output.
 *
 * Read from the org copy's own `prisma/schema.prisma` rather than assumed, so a
 * system that points the generator somewhere else is still handled correctly.
 */
function prismaGeneratorOutput(dir: string): string | null {
  let schema: string;
  try {
    schema = readFileSync(join(dir, "prisma", "schema.prisma"), "utf8");
  } catch {
    return null;
  }
  const generator = /^generator\s+\w+\s*\{[^}]*\}/m.exec(schema)?.[0];
  if (!generator) return null;
  const output = /^\s*output\s*=\s*"([^"]+)"/m.exec(generator)?.[1];
  if (!output) return null;
  // The schema states the output relative to the schema file, so `../src/x`
  // means the system folder's own `src/x`.
  return normalize(join(dir, "prisma", output));
}

/**
 * Hash of the folder's source files.
 *
 * Only files the build actually reads are considered, and a file's path is part
 * of the hash so moving a file counts as a change. Walking the tree is cheap
 * next to a build, and it is what makes "the org edited their system" detectable
 * without trusting a timestamp the org's editor may not have updated.
 *
 * The generated Prisma client is excluded because the runtime *writes* it: a
 * system with a Prisma schema has its client generated into its own source tree
 * and `prisma generate` runs before every build. Hashing it would mean the hash
 * could never match the stored one, so every cold boot would rebuild the system
 * from scratch and the app would take half a minute to open instead of a second.
 */
export function hashRuntimeSources(dir: string): string {
  const generated = prismaGeneratorOutput(dir);
  const hash = createHash("sha256");
  const walk = (current: string, prefix: string): void => {
    let entries: Dirent[];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (SKIP_DIRS.has(entry.name) || entry.name === RUNTIME_STATE_FILE) continue;
      if (entry.name === ".env" || entry.name.startsWith(".env.")) continue;
      const path = join(current, entry.name);
      if (generated && path === generated) continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(path, rel);
      } else if (entry.isFile()) {
        // Compared on the separator-normalised relative path, because the hash is
        // built from those and a Windows walk must not disagree with them.
        if (BOOT_ONLY_FILES.has(rel.split("\\").join("/"))) continue;
        const stat = statSync(path);
        hash.update(`${rel}:${stat.size}:${stat.mtimeMs}\n`);
      }
    }
  };
  walk(dir, "");
  return hash.digest("hex").slice(0, 32);
}

/**
 * Points the org folder at the shared dependency install.
 *
 * A Windows directory junction, not a symlink: junctions need no elevation and
 * resolve like real directories, so `next` and `prisma` treat the linked
 * `node_modules` as an ordinary folder. If the shared install is missing but the
 * master's is not, the shared one is created as a link to it, so a system is
 * installed once and every organization then costs nothing.
 *
 * If the org folder has a real `node_modules` of its own it is left alone: the
 * organization may have installed something deliberately, and a link would
 * silently replace it.
 */
function linkSharedDependencies(orgDir: string, systemSlug: string): boolean {
  const target = join(orgDir, "node_modules");
  const source = ensureSharedInstall(systemSlug);
  if (!source) return false;

  if (existsSync(target)) {
    // A real directory (or an existing link) is left as it is.
    return true;
  }

  ensureDir(join(orgDir, ".."));
  symlinkSync(source, target, "junction");
  return true;
}

/**
 * The one dependency install shared by every org running this system, created on
 * first use as a junction to the master's own `node_modules`.
 */
function ensureSharedInstall(systemSlug: string): string | null {
  const shared = sharedInstallDir(systemSlug);
  if (existsSync(shared)) return shared;

  const master = join(systemSourceRoot(), systemSlug, "node_modules");
  if (!existsSync(master)) return null;

  ensureDir(join(shared, ".."));
  symlinkSync(master, shared, "junction");
  logger.info({ systemSlug }, "[runtime] shared dependency install created");
  return shared;
}

/** Asks the OS for a free port, so two orgs never race for the same one. */
function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, BIND_HOST, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => (port ? resolve(port) : reject(new Error("no free port"))));
    });
  });
}

/**
 * Runs a command in the org's folder, inheriting stdio so failures are visible.
 *
 * The org's own environment is passed in: `prisma migrate deploy` and any
 * page-data collection during `next build` both talk to a database, and they
 * must see the org's, never the platform's.
 *
 * Asynchronous on purpose. This runs *inside a request handler*, and the
 * synchronous form (`execFileSync`) blocks the platform's event loop for the
 * whole build — minutes — which is why a cold system used to make every page on
 * the site slow, not just the one being opened.
 *
 * Output is captured and written to the org's own log rather than inherited.
 * `inherit` looks correct and is not: under a service manager the grandchild
 * writes to a handle nobody reads, so `prisma generate`, `migrate deploy` and —
 * worst — `next build` all fail completely silently. That is exactly what
 * happened to a clone whose build died on a module-resolution error and left
 * nothing behind but a `build_started` line and a 15-minute hang.
 */
function runInFolder(
  cwd: string,
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  logFile?: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });

    let buffered = "";
    const relay = (stream: Readable | null, level: "info" | "error") => {
      if (!stream) return;
      stream.setEncoding("utf8");
      stream.on("data", (chunk: string) => {
        buffered += chunk;
        const lines = buffered.split(/\r?\n/);
        buffered = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          if (logFile) appendJsonLine(logFile, { ts: new Date().toISOString(), level, line });
          logger[level]({ cwd, line }, "[runtime]");
        }
      });
    };
    relay(child.stdout, "info");
    relay(child.stderr, "error");

    // A system build can legitimately take minutes on a cold cache.
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${command} ${args.join(" ")} timed out in ${cwd}`));
    }, 15 * 60_000);
    child.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with code ${code} in ${cwd}`));
    });
  });
}

/**
 * The `package.json` scripts a system was shipped with, or `{}`.
 *
 * The runtime does not know what any particular system is, so it runs the
 * system's own `build` and `start` scripts rather than assuming Next.js. A
 * system that is a Vite SPA or a plain Node server therefore works the same as
 * one that is a Next app, and each system keeps control of how it is built and
 * launched.
 */
function systemScripts(cwd: string): Record<string, string> {
  return readJsonFile<{ scripts?: Record<string, string> }>(
    join(cwd, "package.json"),
    {},
  ).scripts ?? {};
}

/** True when the system manages a database with Prisma. */
function hasPrisma(cwd: string): boolean {
  return existsSync(join(cwd, "prisma", "schema.prisma"));
}

/**
 * Builds the org's copy if its source changed since the last build.
 *
 * The system's own `build` script is used, so whatever it needs to compile
 * itself it does. `prisma generate` is prepended only for systems that have a
 * Prisma schema, because the generated client is written into the org's own
 * source tree and an org may sit on a different Prisma major than the master.
 */
async function ensureBuilt(runtime: OrgRuntime, sourceHash: string, env: NodeJS.ProcessEnv): Promise<void> {
  const stateFile = join(runtime.cwd, RUNTIME_STATE_FILE);
  const state = readJsonFile<RuntimeState | null>(stateFile, null);
  const buildDir = buildOutputDir(runtime.cwd);
  if (isBuildCurrent(state, sourceHash, runtime.basePath) && buildDir && existsSync(buildDir)) {
    runtime.port = state.port;
    return;
  }

  logger.info({ orgSlug: runtime.orgSlug, systemSlug: runtime.systemSlug }, "[runtime] building org system");
  appendJsonLine(orgVaultPaths(runtime.folder).provisioningLog, {
    ts: new Date().toISOString(),
    slug: runtime.orgSlug,
    event: "system.build_started",
    systemSlug: runtime.systemSlug,
  });

  const scripts = systemScripts(runtime.cwd);
  const buildLog = orgVaultPaths(runtime.folder).appLog;
  if (hasPrisma(runtime.cwd)) {
    await runInFolder(runtime.cwd, "npx", ["prisma", "generate"], env, buildLog);
  }
  if (scripts.build) {
    await runInFolder(runtime.cwd, "npm", ["run", "build"], env, buildLog);
  } else {
    // No build script: the system is served from source (e.g. a plain Node
    // server), so there is nothing to compile.
    logger.info({ systemSlug: runtime.systemSlug }, "[runtime] no build script, serving from source");
  }

  writeJsonFile(stateFile, {
    sourceHash,
    basePath: runtime.basePath,
    builtAt: new Date().toISOString(),
    port: runtime.port,
    pid: null,
  } satisfies RuntimeState);
  appendJsonLine(orgVaultPaths(runtime.folder).provisioningLog, {
    ts: new Date().toISOString(),
    slug: runtime.orgSlug,
    event: "system.build_finished",
    systemSlug: runtime.systemSlug,
  });
}

/** The build output a system leaves behind, used to tell a stale build from a fresh one. */
function buildOutputDir(cwd: string): string | null {
  for (const candidate of [".next", "dist", "build", "out"]) {
    if (existsSync(join(cwd, candidate))) return join(cwd, candidate);
  }
  return null;
}

/**
 * True once the process answers on its port, remembering when it last did.
 *
 * A system that ships `api/health` is asked there. One that does not is asked at
 * its own root instead, because a system missing the health route is still
 * allowed to run — refusing to boot it over a diagnostic endpoint would make the
 * endpoint mandatory in practice.
 *
 * The timestamp is written back onto the runtime so a page's worth of chunk
 * requests costs one probe rather than one per request.
 */
async function isHealthy(runtime: OrgRuntime): Promise<boolean> {
  for (const path of [`${runtime.basePath}/api/health`, runtime.basePath]) {
    try {
      const response = await fetch(`${runtime.origin}${path}`, {
        signal: AbortSignal.timeout(1500),
        redirect: "manual",
      });
      // A redirect to a login page means the app is up and serving; anything
      // that is not a server error means the process is alive.
      if (response.status < 500) {
        runtime.healthySince = Date.now();
        return true;
      }
    } catch {
      // Not listening yet — try the next probe.
    }
  }
  runtime.healthySince = null;
  return false;
}
/** The platform's token the system uses to trust the request it was given. */
function runtimeEnv(runtime: OrgRuntime, orgId: string, secret: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: "production",
    // Where this app is mounted. The customer's URL is the app's basePath, so
    // its own links and asset URLs come out right without a rewrite.
    SYSTEM_BASE_PATH: runtime.basePath,
    NEXT_PUBLIC_BASE_PATH: runtime.basePath,
    // The org's own database, and nothing else.
    DATABASE_URL: runtime.databaseUrl,
    DATABASE_SCHEMA: "public",
    // Shared with the platform so the system can verify who the caller is.
    BOS_GATEWAY_SECRET: secret,
    BOS_ORG_ID: orgId,
    BOS_ORG_SLUG: runtime.orgSlug,
    PORT: String(runtime.port),
    HOSTNAME: BIND_HOST,
  };
}

function startProcess(runtime: OrgRuntime, env: NodeJS.ProcessEnv): void {
  const scripts = systemScripts(runtime.cwd);
  // The system's own `start` script, so it decides how it is launched. Only a
  // system with no start script is assumed to be a plain Next app.
  const useNextStart = !scripts.start;
  const command = useNextStart ? "npx" : "npm";
  const args = useNextStart
    ? ["next", "start", "--hostname", BIND_HOST, "--port", String(runtime.port)]
    : ["run", "start"];

  const child = spawn(command, args, {
    cwd: runtime.cwd,
    env,
    // Never `ignore`. A system whose writes fail answers the browser with a
    // generic error and says nothing anywhere else, so with its output discarded
    // a broken clone is indistinguishable from a working one — which is how an
    // organization can be unable to save a single product and the only symptom
    // is that it cannot. The org already owns a log file for exactly this.
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
    shell: process.platform === "win32",
  });

  // Tee, never replace: the lines also go to the platform's own structured log,
  // so a failure is searchable by org and system without opening a file per org.
  const appLog = orgVaultPaths(runtime.folder).appLog;
  const relay = (stream: Readable | null, level: "info" | "error") => {
    if (!stream) return;
    let buffered = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk: string) => {
      buffered += chunk;
      const lines = buffered.split(/\r?\n/);
      buffered = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        appendJsonLine(appLog, { ts: new Date().toISOString(), level, line });
        logger[level]({ orgSlug: runtime.orgSlug, systemSlug: runtime.systemSlug, line }, "[system]");
      }
    });
  };
  relay(child.stdout, "info");
  relay(child.stderr, "error");

  child.on("exit", (code) => {
    logger.warn({ orgSlug: runtime.orgSlug, systemSlug: runtime.systemSlug, code }, "[runtime] exited");
    const current = running.get(key(runtime.orgSlug, runtime.systemSlug));
    if (current?.child === child) running.delete(key(runtime.orgSlug, runtime.systemSlug));
  });
  runtime.child = child;
}

/** Stops the least-recently-used runtimes until there is room for one more. */
async function evictIfFull(): Promise<void> {
  while (running.size >= MAX_RUNNING) {
    const oldest = running.keys().next();
    if (oldest.done) return;
    const victim = running.get(oldest.value);
    if (!victim) return;
    running.delete(oldest.value);
    victim.child?.kill();
    logger.info({ orgSlug: victim.orgSlug, systemSlug: victim.systemSlug }, "[runtime] evicted (pool full)");
  }
}

/**
 * The org's private copy of a system, provisioned on demand.
 *
 * An org can hold the install row and not the files: an install from before the
 * vault existed, a clone that failed, or a folder that was deleted. Answering a
 * request with a 500 in that case is the wrong outcome, so the platform's own
 * copy is cloned in — the same repair the install path performs, and a no-op
 * when the files are already there.
 *
 * `clone` is injectable so the decision can be tested without copying a real
 * system folder. Exported for that test.
 */
export function ensureOrgSystemSource(
  orgSlug: string,
  systemSlug: string,
  cwd: string,
  clone: (org: { slug: string }, systemSlug: string) => CloneResult = cloneSystemForOrg,
): boolean {
  if (existsSync(join(cwd, "package.json"))) return true;

  const result = clone({ slug: orgSlug }, systemSlug);
  logger.warn(
    { orgSlug, systemSlug, cloned: result.cloned, reason: result.reason, files: result.files },
    "[runtime] system was missing from the org and was provisioned on demand",
  );
  return existsSync(join(cwd, "package.json"));
}

async function boot(
  orgId: string,
  orgSlug: string,
  systemSlug: string,
  basePath: string,
  gatewaySecret: string,
): Promise<OrgRuntime> {
  const entry = getVaultEntry(orgSlug);
  const folder = entry?.folder ?? orgSlug;
  const cwd = orgSystemDir(orgVaultPaths(folder), systemSlug);
  if (!ensureOrgSystemSource(orgSlug, systemSlug, cwd)) {
    throw new Error(`No system source for "${systemSlug}" in this organization (expected ${cwd})`);
  }

  const database = await ensureOrgDatabase(folder);
  const depsLinked = linkSharedDependencies(cwd, systemSlug);
  if (!depsLinked) {
    throw new Error(
      `System "${systemSlug}" has no dependencies installed yet. Run "npm install" in ${cwd}, ` +
        `or install the master at ${join(systemSourceRoot(), systemSlug)}.`,
    );
  }

  const sourceHash = hashRuntimeSources(cwd);
  const stateFile = join(cwd, RUNTIME_STATE_FILE);
  const state = readJsonFile<RuntimeState | null>(stateFile, null);
  // Reuse the port from the last build so a restart does not move the app.
  const remembered = isBuildCurrent(state, sourceHash, basePath) ? state.port : 0;
  const port = remembered && remembered >= PORT_RANGE_START && remembered <= PORT_RANGE_END
    ? remembered
    : await findFreePort();

  const runtime: OrgRuntime = {
    orgId,
    orgSlug,
    systemSlug,
    folder,
    cwd,
    port,
    origin: `http://${BIND_HOST}:${port}`,
    basePath,
    databaseName: database.name,
    databaseUrl: database.url,
    child: null,
    healthySince: null,
  };

  const env = runtimeEnv(runtime, orgId, gatewaySecret);
  const buildLog = orgVaultPaths(runtime.folder).appLog;

  // The org's own migrations own its schema, and they run before the build
  // because a build can collect page data. A fresh database is therefore usable
  // the first time the org opens the system, with no manual step and no shared
  // schema to collide with. Systems that manage no database skip this.
  //
  // A folder that is already built at this mount point skips it: `migrate
  // deploy` has nothing to apply and the bootstrap is idempotent, so running
  // them again only cost two process spawns on the path a cold platform restart
  // already pays for.
  if (hasPrisma(cwd) && needsDatabaseSetup(state, sourceHash, basePath)) {
    await runInFolder(cwd, "npx", ["prisma", "migrate", "deploy"], env, buildLog);
  }

  // Migrations create tables, not the rows the app assumes are there. The
  // system's own bootstrap adds the reference data (permissions, roles, the
  // settings rows, and the minimum catalog an organization needs before it can
  // record anything) and nothing else, so a new org can sign in and use the
  // system. It is idempotent, so this is cheap.
  //
  // Deliberately NOT behind `needsDatabaseSetup`. That gate asks whether the
  // folder's sources changed since the last build, and the rows an org needs are
  // not decided by its sources: a bootstrap that grows a new reference row would
  // otherwise reach orgs built afterwards and skip every org built before it,
  // which is exactly the population that cannot enter a product because its
  // category and unit pickers are empty. The cost is a handful of indexed
  // lookups per open, against a missing feature for every existing tenant.
  if (existsSync(join(cwd, "prisma", "bootstrap.ts"))) {
    await runInFolder(cwd, "npx", ["tsx", "prisma/bootstrap.ts"], env, buildLog);
  }

  await ensureBuilt(runtime, sourceHash, env);

  await evictIfFull();
  startProcess(runtime, env);

  // The wait for the process to start listening. Paced rather than a flat 500ms:
  // a cold `next start` is usually up in about a second, and the old schedule
  // spent the first second asleep between probes that could not yet have
  // succeeded. It backs off from there, because a runtime still silent after
  // several seconds is not one more poll away from answering.
  const delays = healthProbeDelays();
  const deadline = Date.now() + BOOT_READY_TIMEOUT_MS;
  for (let attempt = 0; Date.now() < deadline; attempt += 1) {
    if (await isHealthy(runtime)) {
      running.set(key(orgSlug, systemSlug), runtime);
      // The clone is listening and its users table exists, so this is the first
      // moment a stored password can be delivered. Awaited so the request that
      // triggered the boot does not reach the login screen before the digest is
      // there — that is the difference between "type your password" working on
      // the very first visit and working on the second.
      await syncCredentialsOnBoot({
        orgId,
        orgSlug,
        systemSlug,
        target: { origin: runtime.origin, basePath: runtime.basePath },
      });
      writeFileSync(
        stateFile,
        `${JSON.stringify({
          sourceHash,
          basePath,
          builtAt: new Date().toISOString(),
          port,
          pid: runtime.child?.pid ?? null,
        } satisfies RuntimeState, null, 2)}\n`,
      );
      appendJsonLine(orgVaultPaths(folder).provisioningLog, {
        ts: new Date().toISOString(),
        slug: orgSlug,
        event: "system.runtime_started",
        systemSlug,
        port,
        database: database.name,
      });
      logger.info({ orgSlug, systemSlug, port }, "[runtime] org system running");
      return runtime;
    }
    if (runtime.child?.exitCode !== null && runtime.child?.exitCode !== undefined) {
      throw new Error(`System "${systemSlug}" for ${orgSlug} exited with code ${runtime.child.exitCode}`);
    }
    await new Promise((resolve) => setTimeout(resolve, delays[Math.min(attempt, delays.length - 1)] ?? 100));
  }

  runtime.child?.kill();
  throw new Error(`System "${systemSlug}" for ${orgSlug} did not become ready on port ${port}`);
}

/**
 * Returns a running runtime for this org's copy of the system, starting it if
 * needed. Concurrent callers share one boot.
 */
export async function ensureOrgRuntime(input: {
  orgId: string;
  orgSlug: string;
  systemSlug: string;
  basePath: string;
  gatewaySecret: string;
}): Promise<OrgRuntime> {
  const mapKey = key(input.orgSlug, input.systemSlug);
  let existing = running.get(mapKey);
  // A process started at a different mount point serves asset URLs built for
  // that old path, so it has to go before the new one is booted.
  if (existing && existing.basePath !== input.basePath) {
    logger.info(
      { orgSlug: input.orgSlug, systemSlug: input.systemSlug, from: existing.basePath, to: input.basePath },
      "[runtime] mount point moved, restarting runtime",
    );
    stopOrgRuntime(input.orgSlug, input.systemSlug);
    existing = undefined;
  }
  // A runtime that answered recently is taken at its word. The request that
  // follows is itself a real test of the process, so probing again per chunk
  // bought a synchronous round trip on every asset and no extra information.
  //
  // Liveness is the health probe, not the presence of a child handle: a runtime
  // adopted from a previous platform process is genuinely serving but has no
  // child of ours to hold. Requiring `child` here would make adoption pointless
  // by booting a second process over a working one.
  if (existing && !shouldRecheckHealth(existing.healthySince, Date.now())) {
    return existing;
  }
  if (existing && (await isHealthy(existing))) return existing;

  const inFlight = booting.get(mapKey);
  if (inFlight) return inFlight;

  const promise = (async () => {
    // Boot happens inside a global slot, so concurrent first-opens queue rather
    // than all spawning `next build` at once. The slot is held for the whole
    // boot and released even on failure.
    await bootGate.acquire();
    try {
      return await boot(input.orgId, input.orgSlug, input.systemSlug, input.basePath, input.gatewaySecret);
    } finally {
      bootGate.release();
    }
  })();
  booting.set(mapKey, promise);
  try {
    return await promise;
  } finally {
    booting.delete(mapKey);
  }
}

/** Stops one org's runtime, e.g. after the org's system is uninstalled. */
export function stopOrgRuntime(orgSlug: string, systemSlug: string): boolean {
  const mapKey = key(orgSlug, systemSlug);
  const runtime = running.get(mapKey);
  if (!runtime) return false;
  running.delete(mapKey);
  runtime.child?.kill();
  return true;
}

/**
 * Puts back the runtimes a previous platform process started, instead of
 * re-starting them on the next click.
 *
 * The `running` map is in-memory, so a platform restart emptied it while the
 * Node processes it described kept running and listening. The first member to
 * click "open my system" after that paid for a whole cold boot — `next start`
 * plus a health wait — for a system that had been serving the entire time, and
 * the log showed the giveaway: the same org's runtime coming up on a different
 * port after every restart.
 *
 * So the platform adopts what is already up. Every org folder is checked for a
 * recorded runtime, the recorded port is probed, and only a port that genuinely
 * answers is taken back. Anything that fails the probe is left alone, and the
 * normal cold path handles it when it is actually opened.
 *
 * Deliberately best-effort and never thrown: this runs during platform startup,
 * where a failure to rehydrate one folder must not stop the platform serving
 * every other org. The probe is bounded and the whole scan is concurrent, so it
 * costs milliseconds even with many orgs.
 */
export async function adoptPersistedRuntimes(): Promise<OrgRuntime[]> {
  const candidates: OrgRuntime[] = [];

  for (const entry of listVaultEntries()) {
    const folder = entry.folder;
    const systemsDir = join(orgVaultPaths(folder).systems);
    let slugs: string[];
    try {
      slugs = readdirSync(systemsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
    } catch {
      continue;
    }

    for (const systemSlug of slugs) {
      const cwd = orgSystemDir(orgVaultPaths(folder), systemSlug);
      const state = readJsonFile<RuntimeState | null>(join(cwd, RUNTIME_STATE_FILE), null);
      const basePath = state?.basePath;
      if (!state || !basePath) continue;

      const runtime: OrgRuntime = {
        orgId: entry.orgId,
        orgSlug: entry.slug,
        systemSlug,
        folder,
        cwd,
        port: state.port,
        origin: `http://${BIND_HOST}:${state.port}`,
        basePath,
        // Not this process's concern: serving a proxied request never touches
        // the database, and these are only needed to boot a replacement.
        databaseName: entry.databaseName,
        databaseUrl: "",
        // Not this process's child — it belongs to a previous platform process
        // that is gone. Deliberately not adopted as a handle: the port answering
        // is what proves it is alive, and a pid from another boot is not.
        child: null,
        healthySince: null,
      };

      if (!canAdoptPersistedRuntime(state, basePath, true)) continue;
      candidates.push(runtime);
    }
  }

  const adopted = await Promise.all(
    candidates.map(async (runtime) => {
      // The probe is the decision, and it happens here rather than being assumed
      // above: `true` above only meant "worth probing".
      if (!(await isHealthy(runtime))) return null;
      const mapKey = key(runtime.orgSlug, runtime.systemSlug);
      if (running.has(mapKey)) return null;
      running.set(mapKey, runtime);
      return runtime;
    }),
  );

  const revived = adopted.filter((r): r is OrgRuntime => r !== null);
  if (revived.length) {
    logger.info(
      { count: revived.length, systems: revived.map((r) => `${r.orgSlug}/${r.systemSlug}`) },
      "[runtime] adopted runtimes still serving from a previous platform process",
    );
  }
  return revived;
}

/**
 * The running runtime for one (orgId, systemSlug) pair, or null.
 *
 * Never boots and never health-checks: callers use it to ask "can I reach this
 * clone right now?", and a password change must not be the thing that starts a
 * customer's system.
 *
 * The map is keyed by slug, so this scans it. `running` is bounded by
 * `MAX_RUNNING` (8 by default), so the scan is cheaper than maintaining a second
 * index that would have to be updated on every start, stop and eviction.
 */
export function peekOrgRuntime(orgId: string, systemSlug: string): OrgRuntime | null {
  for (const runtime of running.values()) {
    if (runtime.orgId === orgId && runtime.systemSlug === systemSlug) return runtime;
  }
  return null;
}

/** Test seam: forgets every running runtime without killing the processes. */
export function __resetRuntimeState(): void {
  running.clear();
  booting.clear();
  // Drop the build queue and its slots too: a test that reset state must not
  // inherit a slot held by the previous test, nor leave a waiter hanging.
  bootGate.reset(new Error("Runtime state was reset"));
}

export { sharedInstallDir, findFreePort };
export type { ChildProcess };

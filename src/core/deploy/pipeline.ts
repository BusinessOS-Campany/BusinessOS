import { spawn, type ChildProcess } from "node:child_process";
import { cpSync, existsSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/core/db/client";
import { logger } from "@/core/logging/logger";
import { ensureDir, orgVaultPaths, readJsonFile, writeJsonFile } from "@/core/org-vault/paths";
import { orgSystemDir } from "@/core/org-vault/system-clone";
import { ensureOrgDatabase } from "@/core/org-vault/database";
import { getVaultEntry } from "@/core/org-vault/registry";
import {
  ensureOrgRuntime,
  findFreePort,
  hashRuntimeSources,
  linkSharedDependencies,
  stopOrgRuntime,
  type RuntimeState,
} from "@/core/systems/runtime/supervisor";
import { BOOT_READY_TIMEOUT_MS, healthProbeDelays } from "@/core/systems/runtime/build-state";
import { orgSystemPath } from "@/core/systems/runtime/urls";
import { ensureCheckout } from "@/core/github/sources";
import { installationToken } from "@/core/github/client";
import { resolveEnvVars } from "@/core/github/service";
import * as queue from "./queue";

/**
 * The deployment pipeline: one pushed commit becomes every installed org's new
 * code, with the old code kept until the new copy has proven itself.
 *
 * Three stages, in this order, because each one makes the next one safe:
 *
 *  1. **Canonical fetch** (`.systems/<slug>`): the commit is pulled into the one
 *     shared checkout, its dependencies installed there, and its Prisma client
 *     generated. This is also what points the *shared* dependency install at a
 *     fresh `node_modules`, so the per-org copies below pay nothing to install.
 *     Nothing runs here yet — there is no org database to build against.
 *  2. **Staged build, per org**: the canonical source is copied into a hidden
 *     `.<slug>.staging` folder inside the org's own vault, given the org's
 *     database and mount point, built, and *started on a spare port* until it
 *     answers a health probe. The org keeps serving its old build throughout —
 *     this is the "never activate a failed deploy" gate.
 *  3. **Promote**: only the org's runtime is stopped, the built folder is
 *     swapped in, and the supervisor starts it. The previous folder is held
 *     aside and restored if the start fails.
 *
 * Runs *inside the platform process* (see `worker.ts`), because the supervisor's
 * runtime table is in-process: a separate worker could not stop or replace a
 * runtime the platform is holding, so the swap has to happen where that table
 * lives.
 */

const BIND_HOST = "127.0.0.1";

/** Copied source never includes a build artifact or a dependency tree. */
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", ".turbo", ".vercel", "dist", "coverage"]);

/** Build/start steps are generous: a cold `next build` of a real system is minutes. */
const STEP_TIMEOUT_MS = 15 * 60_000;

function gatewaySecret(): string {
  return process.env.AUTH_SECRET ?? "";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

interface Scripts {
  scripts?: Record<string, string>;
}

function scriptsOf(dir: string): Record<string, string> {
  return readJsonFile<Scripts>(join(dir, "package.json"), {}).scripts ?? {};
}

/** Runs a command in a folder, streaming every line to the deployment console. */
function runStep(
  cwd: string,
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  deploymentId: string | null,
  slug: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });

    const attach = (stream: ChildProcess["stdout"], level: "info" | "error") => {
      if (!stream) return;
      let partial = "";
      stream.setEncoding("utf8");
      stream.on("data", (chunk: string) => {
        partial += chunk;
        const lines = partial.split(/\r?\n/);
        partial = lines.pop() ?? "";
        for (const line of lines) {
          if (line.trim()) void queue.logLine(deploymentId, slug, level, line);
        }
      });
    };
    attach(child.stdout, "info");
    attach(child.stderr, "error");

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${command} ${args.join(" ")} timed out`));
    }, STEP_TIMEOUT_MS);
    child.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

/** Copies the master sources into a destination, dropping artifacts and env files. */
function copySource(from: string, to: string): void {
  rmSync(to, { recursive: true, force: true });
  ensureDir(to);
  cpSync(from, to, {
    recursive: true,
    force: true,
    errorOnExist: false,
    filter: (src) => {
      const name = src.split(/[\\/]/).pop() ?? "";
      if (SKIP_DIRS.has(name)) return false;
      if (name === ".env" || (name.startsWith(".env.") && name !== ".env.example")) return false;
      return true;
    },
  });
}

/**
 * The environment a staged build and the promoted runtime run under.
 *
 * Mirrors the supervisor's own `runtimeEnv` exactly: the org's database and
 * nothing else, the mount point the app is compiled for, and the platform's
 * gateway secret so the child can verify the caller it is handed.
 */
function buildEnv(input: {
  basePath: string;
  port: number;
  databaseUrl: string;
  orgId: string;
  orgSlug: string;
  extra: Record<string, string>;
}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: "production",
    SYSTEM_BASE_PATH: input.basePath,
    NEXT_PUBLIC_BASE_PATH: input.basePath,
    DATABASE_URL: input.databaseUrl,
    DATABASE_SCHEMA: "public",
    BOS_GATEWAY_SECRET: gatewaySecret(),
    BOS_ORG_ID: input.orgId,
    BOS_ORG_SLUG: input.orgSlug,
    PORT: String(input.port),
    HOSTNAME: BIND_HOST,
    ...input.extra,
  };
}

async function buildInDir(dir: string, env: NodeJS.ProcessEnv, deploymentId: string | null, slug: string): Promise<void> {
  if (existsSync(join(dir, "prisma", "schema.prisma"))) {
    await runStep(dir, "npx", ["prisma", "generate"], env, deploymentId, slug);
  }
  if (scriptsOf(dir).build) {
    await runStep(dir, "npm", ["run", "build"], env, deploymentId, slug);
  } else {
    await queue.logLine(deploymentId, slug, "info", `[${slug}] no build script; served from source`);
  }
}

async function httpOk(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1500), redirect: "manual" });
    return res.status < 500;
  } catch {
    return false;
  }
}

/**
 * Starts a freshly built folder on a spare port and waits until it answers.
 *
 * This is the gate the whole staged design exists for: a build that compiles but
 * crashes on boot — a missing runtime secret, a bad `start` script — is caught
 * here, while the org is still being served by the previous build.
 */
async function probeStaged(
  dir: string,
  env: NodeJS.ProcessEnv,
  basePath: string,
  port: number,
  deploymentId: string | null,
  slug: string,
): Promise<void> {
  const scripts = scriptsOf(dir);
  const useNextStart = !scripts.start;
  const command = useNextStart ? "npx" : "npm";
  const args = useNextStart
    ? ["next", "start", "--hostname", BIND_HOST, "--port", String(port)]
    : ["run", "start"];

  const child = spawn(command, args, {
    cwd: dir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  });
  const attach = (stream: ChildProcess["stdout"], level: "info" | "error") => {
    if (!stream) return;
    let partial = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk: string) => {
      partial += chunk;
      const lines = partial.split(/\r?\n/);
      partial = lines.pop() ?? "";
      for (const line of lines) if (line.trim()) void queue.logLine(deploymentId, slug, level, line);
    });
  };
  attach(child.stdout, "info");
  attach(child.stderr, "error");

  try {
    const delays = healthProbeDelays();
    const deadline = Date.now() + BOOT_READY_TIMEOUT_MS;
    for (let attempt = 0; Date.now() < deadline; attempt += 1) {
      if (await httpOk(`http://${BIND_HOST}:${port}${basePath}/api/health`)) return;
      if (await httpOk(`http://${BIND_HOST}:${port}${basePath}`)) return;
      if (child.exitCode !== null && child.exitCode !== undefined) {
        throw new Error(`staged process exited with code ${child.exitCode}`);
      }
      await sleep(delays[Math.min(attempt, delays.length - 1)] ?? 100);
    }
    throw new Error(`staged process did not become ready on port ${port}`);
  } finally {
    child.kill();
    // Give the port a moment to be released before the real runtime reuses it.
    await Promise.race([new Promise((r) => child.once("exit", r)), sleep(3000)]);
  }
}

/** Renames a folder, retrying briefly: Windows keeps handles on a just-killed process. */
async function moveWithRetry(from: string, to: string): Promise<void> {
  const deadline = Date.now() + 5000;
  for (;;) {
    try {
      renameSync(from, to);
      return;
    } catch (err) {
      if (Date.now() > deadline) throw err;
      await sleep(150);
    }
  }
}

interface RolloutInput {
  deploymentId: string;
  slug: string;
  orgId: string;
  orgSlug: string;
  masterDir: string;
  gatewaySecret: string;
  envVars: Record<string, string>;
}

/** Stage, build, health-check and atomically swap one organization onto the new commit. */
async function rolloutToOrg(input: RolloutInput): Promise<void> {
  const { deploymentId, slug, orgId, orgSlug, masterDir, envVars } = input;
  const folder = getVaultEntry(orgSlug)?.folder ?? orgSlug;
  const paths = orgVaultPaths(folder);
  ensureDir(paths.systems);

  const basePath = orgSystemPath(orgSlug, slug);
  const target = orgSystemDir(paths, slug);
  const stage = join(paths.systems, `.${slug}.staging`);
  const previous = join(paths.systems, `.${slug}.previous`);

  rmSync(previous, { recursive: true, force: true });
  copySource(masterDir, stage);
  if (!linkSharedDependencies(stage, slug)) {
    throw new Error(`no dependencies available for "${slug}"`);
  }

  const database = await ensureOrgDatabase(folder);
  const port = await findFreePort();
  const env = buildEnv({ basePath, port, databaseUrl: database.url, orgId, orgSlug, extra: envVars });

  await breakpointLog(deploymentId, slug, orgSlug, "building staged copy");
  await buildInDir(stage, env, deploymentId, slug);

  // A state file whose hash matches the folder is what makes the promoted boot
  // reuse this build instead of rebuilding it — the difference between a
  // sub-second cutover and minutes of downtime.
  const state: RuntimeState = {
    sourceHash: hashRuntimeSources(stage),
    basePath,
    builtAt: new Date().toISOString(),
    port: 0,
    pid: null,
  };
  writeJsonFile(join(stage, ".runtime.json"), state);

  await breakpointLog(deploymentId, slug, orgSlug, `health-probing staged copy on :${port}`);
  await probeStaged(stage, env, basePath, port, deploymentId, slug);

  await breakpointLog(deploymentId, slug, orgSlug, "promoting");
  stopOrgRuntime(orgSlug, slug);
  if (existsSync(target)) await moveWithRetry(target, previous);
  await moveWithRetry(stage, target);

  try {
    await ensureOrgRuntime({ orgId, orgSlug, systemSlug: slug, basePath, gatewaySecret: input.gatewaySecret });
    rmSync(previous, { recursive: true, force: true });
    await queue.setOrgStatus(deploymentId, orgId, "active");
    await breakpointLog(deploymentId, slug, orgSlug, "active");
  } catch (err) {
    await breakpointLog(deploymentId, slug, orgSlug, `promote failed (${message(err)}); rolling back`, "error");
    stopOrgRuntime(orgSlug, slug);
    rmSync(target, { recursive: true, force: true });
    if (existsSync(previous)) await moveWithRetry(previous, target);
    // Best-effort: bring the previous build back so the org is not left dark.
    await ensureOrgRuntime({ orgId, orgSlug, systemSlug: slug, basePath, gatewaySecret: input.gatewaySecret }).catch(
      () => undefined,
    );
    throw err;
  }
}

async function breakpointLog(
  deploymentId: string,
  slug: string,
  orgSlug: string,
  text: string,
  level: "info" | "error" = "info",
): Promise<void> {
  await queue.logLine(deploymentId, slug, level, `[${orgSlug}] ${text}`);
}

/** The organizations currently running a system: the fan-out target set. */
async function installedOrgs(slug: string): Promise<{ id: string; slug: string }[]> {
  const rows = await prisma.organizationApp.findMany({
    where: { app: { slug }, status: { in: ["installed", "active"] } },
    select: { organization: { select: { id: true, slug: true } } },
  });
  return rows.map((row) => row.organization);
}

async function runDeployment(d: queue.ClaimedDeployment): Promise<void> {
  const source = await prisma.systemSource.findUnique({ where: { slug: d.slug } });
  if (!source) {
    await queue.setDeploymentStatus(d.id, "failed", `unknown system "${d.slug}"`);
    return;
  }
  if (source.archived) {
    await queue.setDeploymentStatus(d.id, "superseded", `system "${d.slug}" is disconnected`);
    return;
  }

  const envVars = await resolveEnvVars(d.slug);

  await queue.setDeploymentStatus(d.id, "fetching");
  await queue.logLine(d.id, d.slug, "info", `fetching ${source.repoFullName}@${d.commitSha.slice(0, 10)}`);
  const token = await installationToken(source.installationId);
  const checkout = await ensureCheckout({
    slug: d.slug,
    repoFullName: source.repoFullName,
    branch: source.branch,
    token,
    sha: d.commitSha,
  });

  await queue.setDeploymentStatus(d.id, "installing");
  await runStep(checkout.dir, "npm", ["install"], process.env, d.id, d.slug);
  if (existsSync(join(checkout.dir, "prisma", "schema.prisma"))) {
    await runStep(checkout.dir, "npx", ["prisma", "generate"], process.env, d.id, d.slug);
  }

  await prisma.systemDeployment.updateMany({
    where: { slug: d.slug, isActive: true, id: { not: d.id } },
    data: { isActive: false },
  });

  await queue.setDeploymentStatus(d.id, "deploying");
  const orgs = await installedOrgs(d.slug);
  await queue.createOrgRows(d.id, orgs.map((o) => o.id));
  await queue.logLine(d.id, d.slug, "info", `rolling out to ${orgs.length} organization(s)`);

  let failed = 0;
  for (const org of orgs) {
    await queue.setOrgStatus(d.id, org.id, "building");
    try {
      await rolloutToOrg({
        deploymentId: d.id,
        slug: d.slug,
        orgId: org.id,
        orgSlug: org.slug,
        masterDir: checkout.dir,
        gatewaySecret: gatewaySecret(),
        envVars,
      });
    } catch (err) {
      failed += 1;
      const text = message(err);
      await queue.setOrgStatus(d.id, org.id, "failed", { error: text });
      await queue.logLine(d.id, d.slug, "error", `[${org.slug}] ${text}`);
    }
  }

  await prisma.systemSource.update({
    where: { slug: d.slug },
    data: { lastCommitSha: checkout.sha, lastCommitMessage: d.commitMessage, lastSyncedAt: new Date() },
  });

  if (orgs.length > 0 && failed === orgs.length) {
    throw new Error(`rollout failed for all ${orgs.length} organization(s)`);
  }

  await queue.setDeploymentStatus(d.id, "active");
  await queue.logLine(d.id, d.slug, "info", failed > 0 ? `active (${failed} org(s) failed)` : "deployment active");
}

/**
 * Claims and runs at most one queued deployment. Returns false when the queue is
 * empty, which the worker uses to back off.
 *
 * A failure is recorded on the deployment row rather than thrown, so one bad
 * commit can never stop the worker draining the rest of the queue.
 */
export async function processNextDeployment(): Promise<boolean> {
  const claimed = await queue.claimNextDeployment();
  if (!claimed) return false;

  try {
    await runDeployment(claimed);
  } catch (err) {
    const text = message(err);
    logger.error({ err, slug: claimed.slug, deploymentId: claimed.id }, "[deploy] deployment failed");
    await queue.logLine(claimed.id, claimed.slug, "error", text);
    await queue.setDeploymentStatus(claimed.id, "failed", text);
  }
  return true;
}

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { systemSourceRoot } from "./paths";

/**
 * Discovery of the pristine system sources under `system/`.
 *
 * Deliberately dependency-free — only Node builtins and `paths.ts` — because
 * `next.config.ts` imports it to build the rewrite table, and the config file
 * is loaded before the app's module graph (and its logger) exists.
 *
 * A folder under `system/` is a system as soon as it is a directory with a
 * `package.json`. Everything else here is optional, so a system can be dropped
 * in and still be listed, cloned and requested; `systemContract()` reports what
 * it is still missing before it can actually be run.
 */

/** Directories that are never a system, whatever else they contain. */
const IGNORED_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  ".turbo",
  ".vercel",
  "dist",
  "build",
  "coverage",
]);

/** Absolute path of the pristine source for a system slug. */
export function systemSourceDir(systemSlug: string): string {
  return join(systemSourceRoot(), systemSlug);
}

/** True when `system/<slug>/` is a system that can be cloned at all. */
export function hasSystemSource(systemSlug: string): boolean {
  try {
    return statSync(systemSourceDir(systemSlug)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Every system slug that currently has a pristine source folder, sorted.
 *
 * A directory only counts once it has a `package.json`, so a stray notes folder
 * or a half-copied directory in `system/` cannot become a "system" that an org
 * may then request.
 */
export function listSystemSources(): string[] {
  try {
    return readdirSync(systemSourceRoot(), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !IGNORED_DIRS.has(entry.name))
      .map((entry) => entry.name)
      .filter((name) => existsSync(join(systemSourceRoot(), name, "package.json")))
      .sort();
  } catch {
    // No source root yet (fresh checkout, tests with a temp path): no systems.
    return [];
  }
}

function readJson(file: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(file, "utf-8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * What a system must provide before the platform can run it for an org.
 *
 * The runtime is generic — it does not know what any particular system is — so
 * these are the only things it relies on. A system missing them still gets
 * cloned and still appears in the catalog; it just cannot be served until they
 * are there, which is why this is reported rather than enforced.
 */
export interface SystemContract {
  slug: string;
  /** `package.json` is present and parses. */
  package: boolean;
  /** A `build` script, or a Next.js app the runtime can build itself. */
  build: boolean;
  /** Reads `SYSTEM_BASE_PATH`, so its own links and assets come out right. */
  basePath: boolean;
  /** Answers `GET <basePath>/api/health` so the runtime can be probed. */
  health: boolean;
  /** Accepts `POST <basePath>/api/bos/link` to sign a platform user in. */
  link: boolean;
  /** Ships migrations, so a fresh org database can be built. */
  migrations: boolean;
  /** Ships `prisma/bootstrap.ts` to add the rows migrations cannot create. */
  bootstrap: boolean;
  /** The paths checked, for a clear "here is what to add" message. */
  missing: string[];
}

function fileMentions(dir: string, relative: string, needle: string): boolean {
  try {
    return readFileSync(join(dir, relative), "utf-8").includes(needle);
  } catch {
    return false;
  }
}

/** True when any config file in the system reads the given env var. */
function readsEnvVar(dir: string, name: string): boolean {
  const candidates = [
    "next.config.ts",
    "next.config.js",
    "next.config.mjs",
    "next.config.cjs",
    "vite.config.ts",
    "vite.config.js",
  ];
  return candidates.some((file) => fileMentions(dir, file, name));
}

/** True when the system has a route handler at the given app-router path. */
function hasRoute(dir: string, routePath: string): boolean {
  const base = join(dir, "src", "app", ...routePath.split("/"));
  for (const file of ["route.ts", "route.tsx", "route.js", "route.jsx"]) {
    if (existsSync(join(base, file))) return true;
  }
  return false;
}

/** Reports what a system is still missing to be runnable by the platform. */
export function systemContract(systemSlug: string): SystemContract {
  const dir = systemSourceDir(systemSlug);
  const pkg = readJson(join(dir, "package.json"));
  const scripts = (pkg?.scripts ?? {}) as Record<string, string>;

  const basePath = readsEnvVar(dir, "SYSTEM_BASE_PATH");
  const health = hasRoute(dir, "api/health");
  const link = hasRoute(dir, "api/bos/link");
  const migrations = existsSync(join(dir, "prisma", "schema.prisma"));
  const bootstrap = existsSync(join(dir, "prisma", "bootstrap.ts"));
  const build = Boolean(scripts.build);

  const missing: string[] = [];
  if (!basePath) missing.push("reads SYSTEM_BASE_PATH in its build config");
  if (!build) missing.push('a "build" script in package.json');
  if (!health) missing.push("src/app/api/health/route.ts");
  if (!link) missing.push("src/app/api/bos/link/route.ts");
  if (!migrations) missing.push("prisma/schema.prisma with migrations");
  if (!bootstrap) missing.push("prisma/bootstrap.ts");

  return {
    slug: systemSlug,
    package: Boolean(pkg),
    build,
    basePath,
    health,
    link,
    migrations,
    bootstrap,
    missing,
  };
}

/** The contract for every system currently on disk. */
export function allSystemContracts(): SystemContract[] {
  return listSystemSources().map(systemContract);
}

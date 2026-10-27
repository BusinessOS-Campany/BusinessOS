import { existsSync, readdirSync, readFileSync, statSync, type Dirent } from "node:fs";
import { join } from "node:path";
import { managedSystemSourceRoot, systemSourceRoot } from "./paths";

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
  // Vendored sources win: `system/<slug>` is the reviewed, in-repo master, and
  // an imported repo with the same slug must never shadow it.
  const vendored = join(systemSourceRoot(), systemSlug);
  if (existsSync(vendored)) return vendored;
  const managed = join(managedSystemSourceRoot(), systemSlug);
  if (existsSync(managed)) return managed;
  // Neither exists: return the vendored location so callers that only build a
  // path string keep the exact path they had before.
  return vendored;
}

/** True when `system/<slug>/` is a system that can be cloned at all. */
export function hasSystemSource(systemSlug: string): boolean {
  try {
    return statSync(systemSourceDir(systemSlug)).isDirectory();
  } catch {
    return false;
  }
}

/** Directory entries of one source root that look like systems. */
function listRootSources(root: string): string[] {
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !IGNORED_DIRS.has(entry.name))
      .map((entry) => entry.name)
      .filter((name) => existsSync(join(root, name, "package.json")));
  } catch {
    // No root yet (fresh checkout, tests with a temp path): no systems.
    return [];
  }
}

/**
 * Every system vendored under `system/<slug>`, sorted.
 *
 * Vendored-only on purpose: the deployment-source tests read the real tree to
 * prove what this repo ships. GitHub-imported sources live in `.systems/` and
 * are reported by `listSystemSources()` instead.
 */
export function listVendoredSystemSources(): string[] {
  return listRootSources(systemSourceRoot()).sort();
}

/**
 * Every system the platform can clone and serve per org, sorted.
 *
 * The union of the vendored masters under `system/` and the GitHub-imported
 * repositories under `.systems/`. This is the list the catalog, install flow
 * and runtime proxy gate on, so an imported system behaves identically to one
 * committed to the repo — without a single line of its source being copied in.
 * Vendored slugs win on collision (see `systemSourceDir`).
 */
export function listSystemSources(): string[] {
  return [...new Set([...listVendoredSystemSources(), ...listRootSources(managedSystemSourceRoot())])].sort();
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

/**
 * `SESSION_COOKIE = "…"` as a system declares it.
 *
 * Grocery writes `const SESSION_COOKIE = "gs_session"` and dental writes
 * `export const SESSION_COOKIE = "dc_session"`, so the declaration is found by
 * shape rather than by a filename: the two systems keep it in different files and
 * a third will not keep it in either.
 */
const SESSION_COOKIE_DECLARATION = /\bSESSION_COOKIE\s*(?::[^=]+)?=\s*["']([A-Za-z0-9_-]+)["']/;

/** Source files worth reading before walking a whole tree. */
const SESSION_COOKIE_LIKELY = [
  join("src", "lib", "session.ts"),
  join("src", "lib", "auth.ts"),
  join("src", "features", "auth", "session.ts"),
  join("src", "lib", "session", "index.ts"),
];

function readIfPresent(file: string): string | null {
  try {
    return readFileSync(file, "utf-8");
  } catch {
    return null;
  }
}

function findSessionCookie(dir: string): string | null {
  for (const relative of SESSION_COOKIE_LIKELY) {
    const match = SESSION_COOKIE_DECLARATION.exec(readIfPresent(join(dir, relative)) ?? "");
    if (match) return match[1];
  }

  // Nothing in the usual places. Walk `src` rather than give up: a system that
  // names its cookie somewhere else should still work, and a wrong guess here
  // strands a real user at a login loop.
  const stack = [join(dir, "src")];
  while (stack.length > 0) {
    const current = stack.pop()!;
    let entries: Dirent[];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (/\.tsx?$/.test(entry.name)) {
        const match = SESSION_COOKIE_DECLARATION.exec(readIfPresent(full) ?? "");
        if (match) return match[1];
      }
    }
  }
  return null;
}

/**
 * The cookie a system issues its own session under, or null if it declares none.
 *
 * The runtime proxy needs this in two places, and guessing wrong in either is
 * user-visible: it decides whether a caller already holds a session for this
 * system, and it names the cookie to hand upstream on the request that mints
 * one. Both used to be grocery's literal `gs_session`, which left a second system
 * re-linking on every request with its session merged under a name it never
 * reads.
 *
 * Memoised because the proxy asks per request and this walks the filesystem. A
 * stale entry after editing a system's session module is repaired by restarting
 * the platform, which is the same window in which a rebuilt system is picked up
 * anyway.
 */
const sessionCookieCache = new Map<string, string | null>();

export function systemSessionCookie(systemSlug: string): string | null {
  const cached = sessionCookieCache.get(systemSlug);
  if (cached !== undefined) return cached;
  const found = findSessionCookie(systemSourceDir(systemSlug));
  sessionCookieCache.set(systemSlug, found);
  return found;
}

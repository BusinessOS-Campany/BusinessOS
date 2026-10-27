import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Detects how an imported repository is built and started.
 *
 * The task's rule is explicit: do not assume every system uses the same
 * framework or package manager. This reads the repository itself, and every
 * answer can be overridden in `systemSource.buildConfig` by the admin — so a
 * detection this gets wrong is a default, never a dead end.
 */

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";
export type Framework = "next" | "vite" | "node" | "unknown";

export interface BuildConfig {
  installCommand: string;
  buildCommand: string;
  startCommand: string;
  outputDir: string;
}

function readJson(file: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(file, "utf-8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Reads lockfiles in preference order. Bun and pnpm win over the npm default. */
export function detectPackageManager(dir: string): PackageManager {
  if (existsSync(join(dir, "bun.lockb")) || existsSync(join(dir, "bun.lock"))) return "bun";
  if (existsSync(join(dir, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(dir, "yarn.lock"))) return "yarn";
  if (existsSync(join(dir, "package-lock.json"))) return "npm";
  return "npm";
}

/** Framework from config files first, then from declared dependencies. */
export function detectFramework(dir: string): Framework {
  const configFiles = ["next.config.ts", "next.config.js", "next.config.mjs", "next.config.cjs"];
  if (configFiles.some((file) => existsSync(join(dir, file)))) return "next";
  const viteFiles = ["vite.config.ts", "vite.config.js", "vite.config.mts", "vite.config.mjs"];
  if (viteFiles.some((file) => existsSync(join(dir, file)))) return "vite";

  const pkg = readJson(join(dir, "package.json"));
  const deps = { ...(pkg?.dependencies as Record<string, string> | undefined), ...(pkg?.devDependencies as Record<string, string> | undefined) };
  if (deps.next) return "next";
  if (deps.vite) return "vite";
  if (pkg) return "node";
  return "unknown";
}

/** The default commands for a detected stack, overridable by the admin. */
export function defaultBuildConfig(framework: Framework, packageManager: PackageManager): BuildConfig {
  const run = {
    npm: { install: "npm ci || npm install", build: "npm run build", start: "npm run start" },
    pnpm: { install: "pnpm install --frozen-lockfile || pnpm install", build: "pnpm run build", start: "pnpm run start" },
    yarn: { install: "yarn install --frozen-lockfile || yarn install", build: "yarn build", start: "yarn start" },
    bun: { install: "bun install", build: "bun run build", start: "bun run start" },
  }[packageManager];

  if (framework === "next") {
    return {
      installCommand: run.install,
      buildCommand: run.build,
      startCommand: run.start,
      outputDir: ".next",
    };
  }
  if (framework === "vite") {
    return {
      installCommand: run.install,
      buildCommand: run.build,
      // A static Vite build is served from its output directory.
      startCommand: run.start,
      outputDir: "dist",
    };
  }
  return {
    installCommand: run.install,
    buildCommand: run.build,
    startCommand: run.start,
    outputDir: "dist",
  };
}

/** A plausible slug from a repository name, without inventing characters. */
export function slugifyRepoName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 48);
}

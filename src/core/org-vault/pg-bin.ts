import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Locating the PostgreSQL client binaries (`pg_dump`, `psql`, `initdb`, `pg_ctl`).
 *
 * Every one of these tools is called by absolute path, because a tool that
 * silently fails is worse than one that is missing loudly. The concrete failure
 * this exists to prevent: `pg_dump` being absent from `PATH` on a server where
 * PostgreSQL is installed but not exposed to the shell. The backup code treated
 * that `ENOENT` as "fall back to a logical JSON snapshot" and recorded the
 * result as verified — so every backup looked healthy and none of them could be
 * restored with `psql`.
 *
 * Deliberately dependency-free (Node builtins only) for the same reason
 * `org-vault/system-sources.ts` is: `next.config.ts` and the org-vault runtime
 * both load before the app's module graph and logger exist.
 *
 * Resolution order, first hit wins:
 *   1. `PG_BIN_DIR` — the explicit override, unchanged.
 *   2. `PATH` via `where` / `which`.
 *   3. Windows registry install roots.
 *   4. Conventional install directories, newest version first.
 */

const IS_WINDOWS = process.platform === "win32";

/** Memoised: the answer cannot change while the process runs, and `where` is a process spawn. */
let cached: string | null | undefined;

function fromPath(name: string): string | null {
  try {
    const found = execFileSync(IS_WINDOWS ? "where" : "which", [name], {
      encoding: "utf-8",
      timeout: 5_000,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    return found ?? null;
  } catch {
    return null;
  }
}

function windowsRegistryRoots(): string[] {
  if (!IS_WINDOWS) return [];
  const roots: string[] = [];
  for (const hive of [
    "HKLM:/SOFTWARE/PostgreSQL",
    "HKLM:/SOFTWARE/WOW6432Node/PostgreSQL",
  ]) {
    let versions: string[];
    try {
      versions = readdirSync(hive);
    } catch {
      continue;
    }
    for (const version of versions) {
      try {
        const base = execFileSync(
          "reg",
          ["query", hive.replace(/\//g, "\\"), version, "/v", "Base Directory"],
          { encoding: "utf-8", timeout: 5_000, stdio: ["ignore", "pipe", "ignore"] },
        );
        const match = /Base Directory\s+REG_\w+\s+(.+)/i.exec(base);
        if (match) roots.push(join(match[1].trim(), "bin"));
      } catch {
        // No Base Directory for this version; the conventional path may still hit.
      }
    }
  }
  return roots;
}

function conventionalRoots(): string[] {
  if (IS_WINDOWS) {
    const parent = "C:\\Program Files\\PostgreSQL";
    let versions: string[] = [];
    try {
      versions = readdirSync(parent);
    } catch {
      return [];
    }
    // Newest major first: 16 sorts after 9 as a string, so compare numerically.
    return versions
      .sort((a, b) => (parseInt(b, 10) || 0) - (parseInt(a, 10) || 0))
      .map((version) => join(parent, version, "bin"));
  }
  const roots = ["/usr/lib/postgresql", "/usr/pgsql-"];
  const found: string[] = [];
  for (const root of roots) {
    try {
      found.push(
        ...readdirSync(root)
          .sort((a, b) => (parseInt(b, 10) || 0) - (parseInt(a, 10) || 0))
          .map((entry) => join(root, entry, "bin")),
      );
    } catch {
      // Not a PostgreSQL root; try the next one.
    }
  }
  found.push("/opt/homebrew/opt", "/usr/local/opt");
  return found.flatMap((root) => {
    try {
      return readdirSync(root)
        .filter((entry) => entry.startsWith("postgresql"))
        .map((entry) => join(root, entry, "bin"));
    } catch {
      return [];
    }
  });
}

/**
 * The directory holding the PostgreSQL binaries, or null when there is none.
 *
 * Null is a real answer, not a fallback: callers must decide what an absent
 * binary means for them instead of silently degrading.
 */
export function pgBinDir(): string | null {
  if (cached !== undefined) return cached;

  const override = process.env.PG_BIN_DIR?.trim();
  if (override) {
    cached = override;
    return cached;
  }

  const onPath = fromPath("pg_dump");
  if (onPath) {
    // `where` returns the executable itself; take its folder.
    cached = join(onPath, "..");
    return cached;
  }

  for (const dir of [...windowsRegistryRoots(), ...conventionalRoots()]) {
    if (existsSync(join(dir, IS_WINDOWS ? "pg_dump.exe" : "pg_dump"))) {
      cached = dir;
      return cached;
    }
  }

  cached = null;
  return cached;
}

/** Absolute path of one PostgreSQL tool, or null when it cannot be found. */
export function pgBinary(name: string): string | null {
  const dir = pgBinDir();
  if (!dir) return null;
  return join(dir, IS_WINDOWS ? `${name}.exe` : name);
}

/** Test seam: forget the memoised answer. */
export function resetPgBinDirCache(): void {
  cached = undefined;
}

import { spawn } from "node:child_process";
import { delimiter, join } from "node:path";

/**
 * Production build launcher.
 *
 * Wired to `npm run build` because `next build --webpack` on this app runs out of
 * memory and dies with "Ineffective mark-compacts near heap limit" part-way
 * through compilation. The machine has 31 GB; the ceiling was the only thing in
 * the way.
 *
 * Why a script and not `NODE_OPTIONS=... next build` in package.json: npm runs
 * scripts through `cmd.exe` on Windows, where a `VAR=value command` prefix is a
 * syntax error, so the portable form needs a shell wrapper we do not want as a
 * dependency. This mirrors `scripts/dev.ts`, which already exists for the same
 * class of reason.
 *
 * `--max-old-space-size` is only raised, never lowered, and an explicit
 * NODE_OPTIONS in the environment still wins — this is a floor for a machine
 * that has not configured one, not an override of a deliberate choice.
 *
 * The figure was 8192 and the build still died there: webpack's compile phase,
 * not the file-tracing phase, is what exhausts the heap. Measured on this
 * machine, 8192 fails and 16384 completes and prints the route table. That is
 * now past what a 16 GB CI box can give a Node process, so a smaller runner
 * needs `NODE_OPTIONS` set explicitly for itself — this value is a floor, not a
 * claim that 16 GB of CI is enough.
 *
 * Verifiable goal: `npm run build` completes and prints the route table instead
 * of a V8 stack trace.
 */

const ROOT = process.cwd();

/** Verified sufficient on this machine (31 GB); see the note above. */
const DEFAULT_MAX_OLD_SPACE_MB = 16384;

function withHeapCap(nodeOptions: string | undefined): string {
  const requested = /--max-old-space-size=(\d+)/.exec(nodeOptions ?? "");
  const currentMb = requested ? Number(requested[1]) : 0;
  if (currentMb >= DEFAULT_MAX_OLD_SPACE_MB) return nodeOptions ?? "";
  const kept = (nodeOptions ?? "").trim();
  return `${kept}${kept ? " " : ""}--max-old-space-size=${DEFAULT_MAX_OLD_SPACE_MB}`;
}

const nodeOptions = withHeapCap(process.env.NODE_OPTIONS);

const child = spawn("next", ["build", "--webpack"], {
  cwd: ROOT,
  shell: true,
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_OPTIONS: nodeOptions,
    // `npm run` puts node_modules/.bin on PATH; a bare spawn does not.
    PATH: `${join(ROOT, "node_modules", ".bin")}${delimiter}${process.env.PATH ?? ""}`,
  },
});

child.on("exit", (code, signal) => {
  process.exit(signal ? 1 : (code ?? 1));
});

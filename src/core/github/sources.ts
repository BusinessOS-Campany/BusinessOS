import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { spawn } from "node:child_process";
import { managedSystemSourceRoot } from "@/core/org-vault/paths";

/**
 * Checks a GitHub repository out into the managed source root (`.systems/`).
 *
 * This is the only place the platform runs `git` against a customer repository,
 * and it is treated as untrusted input throughout:
 *  - every argument is passed as an array element, never a shell string, so a
 *    branch or path cannot become a command;
 *  - branch/repo/slug are shape-validated before they reach git, so a value
 *    like `--upload-pack=…` cannot be read as an option;
 *  - the destination is asserted to sit inside the managed root, so a crafted
 *    slug cannot write outside it.
 *
 * `spawn` (async) is used, never `spawnSync`: a clone can take minutes and
 * `spawnSync` would freeze the whole control plane while it runs.
 */

export class GitError extends Error {
  constructor(
    message: string,
    public readonly stderr: string,
  ) {
    super(message);
    this.name = "GitError";
  }
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REPO_FULL_NAME_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const REF_RE = /^[A-Za-z0-9._\/-]{1,200}$/;
const SHA_RE = /^[a-f0-9]{7,64}$/i;

export function assertSafeSlug(slug: string): void {
  if (!SLUG_RE.test(slug)) throw new GitError(`Unsafe system slug: ${slug}`, "");
}

export function assertSafeRepoFullName(fullName: string): void {
  if (!REPO_FULL_NAME_RE.test(fullName) || fullName.includes("..")) {
    throw new GitError(`Unsafe repository name: ${fullName}`, "");
  }
}

export function assertSafeRef(ref: string): void {
  if (!REF_RE.test(ref) || ref.startsWith("-") || ref.includes("..") || ref.endsWith(".lock")) {
    throw new GitError(`Unsafe git ref: ${ref}`, "");
  }
}

export function assertSafeSha(sha: string): void {
  if (!SHA_RE.test(sha)) throw new GitError(`Unsafe commit sha: ${sha}`, "");
}

/** Absolute checkout directory for a slug, asserted to stay inside the root. */
export function systemCheckoutDir(slug: string): string {
  assertSafeSlug(slug);
  const root = resolve(managedSystemSourceRoot());
  const dir = resolve(root, slug);
  if (dir !== root && !dir.startsWith(root + sep)) {
    throw new GitError(`Refusing to check out outside the managed root: ${dir}`, "");
  }
  return dir;
}

/** True when the slug already has a checkout on disk. */
export function hasCheckout(slug: string): boolean {
  try {
    return existsSync(join(systemCheckoutDir(slug), ".git"));
  } catch {
    return false;
  }
}

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Masks the installation token wherever it may appear in git output. */
function maskSecret(text: string, secret: string): string {
  return secret ? text.split(secret).join("***") : text;
}

function runGit(args: string[], options: { cwd?: string; timeoutMs?: number; secret?: string } = {}): Promise<RunResult> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn("git", args, {
      cwd: options.cwd,
      windowsHide: true,
      env: {
        ...process.env,
        // Never hang on an interactive credential prompt in a background worker.
        GIT_TERMINAL_PROMPT: "0",
        GIT_ASKPASS: "echo",
        // Keep checked-out files byte-stable on Windows.
        GIT_CONFIG_NOSYSTEM: "1",
      },
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      rejectRun(new GitError("git timed out", maskSecret(stderr, options.secret ?? "")));
    }, options.timeoutMs ?? 300_000);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rejectRun(new GitError(`git failed to start: ${err.message}`, ""));
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveRun({ code: code ?? -1, stdout, stderr: maskSecret(stderr, options.secret ?? "") });
    });
  });
}

async function git(args: string[], options: { cwd?: string; timeoutMs?: number; secret?: string } = {}): Promise<RunResult> {
  const result = await runGit(args, options);
  if (result.code !== 0) {
    throw new GitError(`git ${args[0]} exited ${result.code}`, result.stderr.slice(-2000));
  }
  return result;
}

function authedUrl(repoFullName: string, token: string): string {
  assertSafeRepoFullName(repoFullName);
  return `https://x-access-token:${encodeURIComponent(token)}@github.com/${repoFullName}.git`;
}

export interface CheckoutParams {
  slug: string;
  repoFullName: string;
  branch: string;
  token: string;
  /** Commit to check out. Omitted for an import: the branch tip is used. */
  sha?: string;
}

export interface CheckoutResult {
  dir: string;
  sha: string;
  created: boolean;
}

/**
 * Ensures `.systems/<slug>` holds the requested branch at the requested commit.
 *
 * On first call: a full clone of the branch. Afterwards: fetch the branch and
 * hard-reset to the target, which is safe because this tree is a build input
 * only — nothing in it is a user's work, and `git reset --hard` is what makes a
 * re-deploy of an older sha actually revert the files.
 */
export async function ensureCheckout(params: CheckoutParams): Promise<CheckoutResult> {
  const { slug, repoFullName, branch, token } = params;
  assertSafeSlug(slug);
  assertSafeRepoFullName(repoFullName);
  assertSafeRef(branch);
  if (params.sha) assertSafeSha(params.sha);

  const dir = systemCheckoutDir(slug);
  const created = !hasCheckout(slug);
  const secret = token || "";

  if (created) {
    mkdirSync(dir, { recursive: true });
    await git(["clone", "--no-tags", "--single-branch", "--branch", branch, "--", authedUrl(repoFullName, token), "."], {
      cwd: dir,
      secret,
      timeoutMs: 600_000,
    });
  } else {
    await git(["remote", "set-url", "origin", authedUrl(repoFullName, token)], { cwd: dir, secret });
    await git(["fetch", "--no-tags", "--prune", "origin", branch], { cwd: dir, secret, timeoutMs: 600_000 });
  }

  const target = params.sha ?? `origin/${branch}`;
  await git(["reset", "--hard", target], { cwd: dir, secret });
  await git(["clean", "-fdx", "-e", ".runtime", "-e", ".next-dev"], { cwd: dir, secret });

  const head = await git(["rev-parse", "HEAD"], { cwd: dir, secret });
  return { dir, sha: head.stdout.trim(), created };
}

/** The checked-out commit of an existing checkout, or null. */
export function currentCommitSha(slug: string): string | null {
  try {
    const headPath = join(systemCheckoutDir(slug), ".git", "HEAD");
    const head = readFileSync(headPath, "utf8").trim();
    // Detached HEAD (the normal case after a deploy) carries the sha directly.
    if (SHA_RE.test(head)) return head;
    return null;
  } catch {
    return null;
  }
}

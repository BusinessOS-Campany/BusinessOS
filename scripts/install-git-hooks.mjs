// Points core.hooksPath at the tracked .githooks/ directory so a clone on any
// machine picks up the auto-push post-commit hook. Runs from the `prepare`
// lifecycle script, which npm executes after `npm install`.
//
// Plain .mjs on purpose: prepare also fires during a first `npm install`, where
// tsx may not be resolvable yet, so this must run on bare node.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const hooksDir = join(repoRoot, ".githooks");

if (!existsSync(hooksDir)) {
  console.error(`install-git-hooks: ${hooksDir} is missing, hooks left unchanged.`);
  process.exit(0);
}

execFileSync("git", ["config", "core.hooksPath", ".githooks"], { cwd: repoRoot });

console.log("install-git-hooks: core.hooksPath=.githooks (auto-push enabled).");
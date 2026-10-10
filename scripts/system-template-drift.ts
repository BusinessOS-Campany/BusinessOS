/**
 * Is a system's demo still the same application as its template?
 *
 * `system/<slug>` is what a customer gets installed; the demo folder is what the
 * public `/demo/<slug>` actually serves. They are the same app, so `src` must be
 * byte-identical -- and nothing in the product makes that true. A fix applied to
 * one tree is simply absent from the other until someone notices, which is how
 * the dental demo served a 117-file-old dashboard on 2026-10-08 and how the
 * grocery pair still carries its own fork today.
 *
 * This reads the real trees and names every difference. It does not fix them:
 * some are deliberate (a demo pointing at its own database) and deciding which is
 * which is a judgement about intent, not a diff.
 *
 * Run: npx tsx scripts/system-template-drift.ts
 * Exits 1 when any pair has drifted, so it can be used as a gate.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * `src/generated/` is Prisma client output: its bytes carry the client's version,
 * not an edit, and the two trees are generated at different times. Comparing it
 * would report drift on every run and drown the real differences.
 */
const IGNORED_DIRS = new Set(["generated", "node_modules", ".next", "serverdata"]);

export interface TreeDrift {
  onlyTemplate: string[];
  onlyDemo: string[];
  contentDiffers: string[];
}

/** Relative POSIX paths -> sha1 of the bytes, for every file under `dir`. */
function fingerprint(dir: string): Map<string, string> {
  const files = new Map<string, string>();
  if (!existsSync(dir)) return files;

  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const abs = join(current, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) walk(abs);
        continue;
      }
      const rel = relative(dir, abs).split(sep).join("/");
      files.set(rel, createHash("sha1").update(readFileSync(abs)).digest("hex"));
    }
  };

  walk(dir);
  return files;
}

/**
 * Three separate questions, kept separate because they need different fixes: a
 * file the demo never received is a copy that missed it, while a file that exists
 * in both but reads differently is two edits that diverged.
 */
export function compareTemplateToDemo(templateSrc: string, demoSrc: string): TreeDrift {
  const template = fingerprint(templateSrc);
  const demo = fingerprint(demoSrc);

  return {
    onlyTemplate: [...template.keys()].filter((rel) => !demo.has(rel)).sort(),
    onlyDemo: [...demo.keys()].filter((rel) => !template.has(rel)).sort(),
    contentDiffers: [...template.keys()]
      .filter((rel) => demo.has(rel) && demo.get(rel) !== template.get(rel))
      .sort(),
  };
}

async function main(): Promise<void> {
  // Imported lazily so the comparison above stays usable -- and testable -- without
  // the demo registry and its configuration being loaded.
  const { DEMO_SYSTEMS } = await import("@/core/demo/demo-systems");
  const { systemSourceDir } = await import("@/core/org-vault/system-sources");

  let drifted = 0;

  for (const demo of DEMO_SYSTEMS) {
    const templateSrc = join(systemSourceDir(demo.slug), "src");
    const demoSrc = join(process.cwd(), demo.sourceDir, "src");
    if (!existsSync(templateSrc) || !existsSync(demoSrc)) continue;

    const drift = compareTemplateToDemo(templateSrc, demoSrc);
    const count =
      drift.onlyTemplate.length + drift.onlyDemo.length + drift.contentDiffers.length;

    if (count === 0) {
      console.log(`OK    ${demo.slug.padEnd(10)} ${demo.sourceDir}`);
      continue;
    }

    drifted += 1;
    console.log(`DRIFT ${demo.slug.padEnd(10)} ${demo.sourceDir}`);
    for (const rel of drift.onlyTemplate) console.log(`        missing from demo: ${rel}`);
    for (const rel of drift.onlyDemo) console.log(`        not in template:   ${rel}`);
    for (const rel of drift.contentDiffers) console.log(`        differs:           ${rel}`);
  }

  console.log(drifted === 0 ? "\nEvery pair is in sync." : `\n${drifted} pair(s) have drifted.`);
  process.exit(drifted === 0 ? 0 : 1);
}

if (process.argv[1]?.endsWith("system-template-drift.ts")) {
  void main();
}

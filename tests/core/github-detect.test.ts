import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, describe, expect, it } from "vitest";
import {
  defaultBuildConfig,
  detectFramework,
  detectPackageManager,
  slugifyRepoName,
} from "@/core/github/detect";
import {
  assertSafeRef,
  assertSafeRepoFullName,
  assertSafeSha,
  assertSafeSlug,
  systemCheckoutDir,
} from "@/core/github/sources";
import { GitError } from "@/core/github/sources";
import { managedSystemSourceRoot } from "@/core/org-vault/paths";

const root = mkdtempSync(join(tmpdir(), "bos-detect-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function repo(name: string, files: Record<string, string>): string {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  for (const [file, body] of Object.entries(files)) {
    writeFileSync(join(dir, file), body);
  }
  return dir;
}

describe("stack detection", () => {
  it("detects a Next.js app and npm", () => {
    const dir = repo("next-app", {
      "next.config.ts": "export default {}",
      "package-lock.json": "{}",
      "package.json": JSON.stringify({ dependencies: { next: "16" } }),
    });
    expect(detectFramework(dir)).toBe("next");
    expect(detectPackageManager(dir)).toBe("npm");
  });

  it("prefers a lockfile over the npm default", () => {
    const dir = repo("pnpm-app", { "pnpm-lock.yaml": "", "package.json": "{}" });
    expect(detectPackageManager(dir)).toBe("pnpm");
    const yarn = repo("yarn-app", { "yarn.lock": "", "package.json": "{}" });
    expect(detectPackageManager(yarn)).toBe("yarn");
    const bun = repo("bun-app", { "bun.lockb": "", "package.json": "{}" });
    expect(detectPackageManager(bun)).toBe("bun");
  });

  it("detects vite from a config file and node as the fallback", () => {
    expect(detectFramework(repo("vite-app", { "vite.config.ts": "", "package.json": "{}" }))).toBe("vite");
    expect(detectFramework(repo("plain", { "package.json": "{}" }))).toBe("node");
    expect(detectFramework(repo("empty", {}))).toBe("unknown");
  });

  it("keeps the next build output dir and the vite one different", () => {
    expect(defaultBuildConfig("next", "pnpm").outputDir).toBe(".next");
    expect(defaultBuildConfig("next", "pnpm").buildCommand).toContain("pnpm");
    expect(defaultBuildConfig("vite", "npm").outputDir).toBe("dist");
  });
});

describe("slug derivation", () => {
  it("makes a kebab-case slug from a repository name", () => {
    expect(slugifyRepoName("My_Grocery System")).toBe("my-grocery-system");
    expect(slugifyRepoName("--weird--")).toBe("weird");
  });
});

describe("git input guards", () => {
  it("rejects slugs that are not kebab-case", () => {
    expect(() => assertSafeSlug("Grocery")).toThrow(GitError);
    expect(() => assertSafeSlug("../evil")).toThrow(GitError);
    expect(() => assertSafeSlug("a b")).toThrow(GitError);
    expect(() => assertSafeSlug("grocery-2")).not.toThrow();
  });

  it("rejects repository names that could traverse or inject", () => {
    expect(() => assertSafeRepoFullName("owner/..")).toThrow(GitError);
    expect(() => assertSafeRepoFullName("owner only")).toThrow(GitError);
    expect(() => assertSafeRepoFullName("org/ERP")).not.toThrow();
  });

  it("rejects a ref that could be read as an option", () => {
    expect(() => assertSafeRef("--upload-pack=evil")).toThrow(GitError);
    expect(() => assertSafeRef("main")).not.toThrow();
    expect(() => assertSafeRef("release/2026.1")).not.toThrow();
  });

  it("rejects a sha that is not hexadecimal", () => {
    expect(() => assertSafeSha("../../etc/passwd")).toThrow(GitError);
    expect(() => assertSafeSha("7bf6633a1b2c3d4e5f60718293a4b5c6d7e8f901")).not.toThrow();
  });

  it("resolves a checkout dir inside the managed root only", () => {
    const managed = resolve(managedSystemSourceRoot());
    const dir = systemCheckoutDir("grocery");
    expect(dir.startsWith(managed + sep)).toBe(true);
    expect(dir).toBe(join(managed, "grocery"));
    expect(() => systemCheckoutDir("../escape")).toThrow(GitError);
  });
});

/**
 * The public mount of a demo system is derived from where its source lives, and
 * three separate places depend on the result: the platform rewrite, the links on
 * `/demo`, and the sub-app's own `basePath`. Nothing in that chain is checked at
 * compile time, so a mount can move in one and not the others and the only
 * symptom is a 404 at run time.
 *
 * That is not hypothetical. The grocery app was rewritten onto `/demo/grocery`
 * while the links on `/demo` still pointed at `/grocery`, and the two tests in
 * this file are the ones that would have caught it.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BUSINESS_SYSTEMS } from "@/core/demo/business-systems-data";
import { DEMO_SYSTEMS, mountPath } from "@/core/demo/demo-systems";
import { liveHref } from "@/core/demo/systems-catalog";

const REPO_ROOT = join(__dirname, "..", "..");

describe("mountPath", () => {
  it("serves apps built in this repo under the /demo namespace", () => {
    expect(mountPath("demo-systems/grocery", "grocery")).toBe("/demo/grocery");
  });

  it("leaves separately deployed apps at their own root-level path", () => {
    expect(mountPath("public/pharmacy", "pharmacy")).toBe("/pharmacy");
  });
});

describe("demo system registry", () => {
  it("derives every rootPath from sourceDir rather than accepting a hand-written one", () => {
    for (const system of DEMO_SYSTEMS) {
      expect(system.rootPath).toBe(mountPath(system.sourceDir, system.slug));
    }
  });

  it("gives each system a unique mount", () => {
    const mounts = DEMO_SYSTEMS.map((s) => s.rootPath);
    expect(new Set(mounts).size).toBe(mounts.length);
  });

  it("mounts nothing at the bare /demo, which is the marketplace page itself", () => {
    for (const system of DEMO_SYSTEMS) {
      expect(system.rootPath).not.toBe("/demo");
    }
  });
});

describe("catalog links", () => {
  it("points every live catalog link at a mount the registry actually serves", () => {
    const mounts = new Set(DEMO_SYSTEMS.map((s) => s.rootPath));
    for (const system of DEMO_SYSTEMS) {
      expect(liveHref(system.slug)).toBe(system.rootPath);
    }
    // The catalog also keys SAMA as "sama"; a stale entry has to be visible here.
    expect(mounts.has(liveHref("sama")!)).toBe(true);
  });
});

describe("/demo marketplace cards", () => {
  /**
   * The cards on `/demo` come from a hand-written list, not from the registry, so
   * an app the platform now serves stays rendered as coming-soon until its entry
   * is flipped by hand. The status decides whether the card opens the app or just
   * scrolls to the roadmap, which is why this is asserted per system.
   */
  const hosted = DEMO_SYSTEMS.filter((s) => s.sourceDir.startsWith("demo-systems/"));

  it("offers every repo-hosted app as available instead of coming soon", () => {
    for (const system of hosted) {
      const card = BUSINESS_SYSTEMS.find((s) => s.id === system.slug);
      expect(card, system.slug).toBeDefined();
      expect(card!.status, system.slug).toBe("available");
    }
  });

  it("sends each available card to the mount the registry serves", () => {
    for (const system of hosted) {
      const card = BUSINESS_SYSTEMS.find((s) => s.id === system.slug)!;
      expect(card.route, system.slug).toBe(system.rootPath);
    }
  });
});

describe("repo-hosted sub-apps", () => {
  /**
   * Only the apps built inside this repo can be checked from the test — the rest
   * are separately deployed and are probed at build time instead (see
   * `resolveDemoUpstreams`). A `demo-systems/` entry whose folder is missing is
   * not a graceful degradation like a `public/` one: `resolveDemoUpstreams`
   * trusts the folder, so the rewrite is created and then 502s on a dead port.
   */
  const hosted = DEMO_SYSTEMS.filter((s) => s.sourceDir.startsWith("demo-systems/"));

  it("hosts the apps that were moved into this repo", () => {
    expect(hosted.map((s) => s.slug)).toEqual(expect.arrayContaining(["dental", "grocery"]));
  });

  it("points every hosted entry at a folder that actually exists", () => {
    for (const system of hosted) {
      expect(existsSync(join(REPO_ROOT, system.sourceDir, "package.json")), system.slug).toBe(true);
    }
  });

  /**
   * A sub-app serves itself at whatever `basePath` it was built with, and emits
   * every link, redirect and asset URL under it. So the platform mount and this
   * value are two halves of one contract: if they disagree the app loads and
   * then dead-ends on its first navigation.
   *
   * Checked for every hosted app rather than grocery alone. A registry entry
   * pointing at a real folder is not enough on its own — the app still has to
   * be built with the mount the platform routes it to, and that is a value in
   * a different file in a different tree, with nothing linking the two.
   */
  it("builds every hosted app with a basePath equal to the mount it is served at", () => {
    for (const system of hosted) {
      const config = readFileSync(
        join(REPO_ROOT, system.sourceDir, "next.config.ts"),
        "utf8",
      );
      expect(/basePath:\s*"([^"]+)"/.exec(config)?.[1], system.slug).toBe(system.rootPath);
    }
  });
});

describe("grocery sub-app", () => {
  const grocery = DEMO_SYSTEMS.find((s) => s.slug === "grocery")!;

  it("scopes the signout redirect to the same mount", () => {
    // The app cannot read its own mount from the request behind the rewrite
    // proxy, so it declares it as a literal; that literal has to agree too.
    const route = readFileSync(
      join(REPO_ROOT, "demo-systems", "grocery", "src", "app", "api", "auth", "expire", "route.ts"),
      "utf8",
    );
    expect(/const APP_BASE_PATH = "([^"]+)"/.exec(route)?.[1]).toBe(grocery.rootPath);
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every customer-facing install must go through the platform approval queue.
 *
 * `installSystemForOrg` installs immediately — it writes the `organization_apps`
 * row, registers the org's vault and clones the system's source, all without a
 * human. That is correct for the platform console, which has already decided, and
 * wrong for a tenant clicking a card. The two were wired to the same function, so
 * a customer install bypassed the queue entirely and the org got the system
 * before anyone approved it.
 *
 * Asserted on the route source rather than over HTTP, for the same reason
 * `approval-clones-system.test.ts` does: the invariant is "this route calls that
 * function", and a route that stops calling it keeps answering 200 while
 * quietly granting installs nobody approved.
 */
const ROUTES = {
  /** The marketplace card's action, and what /systems and /{org}/my-apps call. */
  request: "src/app/api/v1/apps/[slug]/request/route.ts",
  /** The alias of the same action. */
  install: "src/app/api/v1/apps/[slug]/install/route.ts",
  /** Where a queued request is resolved — the one place a human decides. */
  approval: "src/app/api/platform/app-requests/[id]/route.ts",
} as const;

const routeSource = (relative: string): string => readFileSync(join(process.cwd(), relative), "utf8");

describe("a tenant install queues for approval", () => {
  for (const [name, path] of Object.entries(ROUTES)) {
    if (name === "approval") continue;
    it(`${name} files a request instead of installing`, () => {
      const source = routeSource(path);
      expect(source, path).toContain("requestSystemForTenant(");
      expect(source, path).not.toContain("installSystemForOrg(");
    });
  }
});

describe("the approval queue is the only way a tenant gets a system", () => {
  it("approving a request performs the install", () => {
    // Otherwise the queue resolves to a status change and the org owns a system
    // row with no files and no vault entry behind it.
    expect(routeSource(ROUTES.approval)).toContain("installSystemForOrg(");
  });

  it("installSystemForOrg is what actually clones the source", () => {
    // `installSystemForOrg` writes the row, registers the vault and clones, and
    // rolls the row back when the copy fails. Asserted here because the approval
    // route no longer calls `cloneInstalledSystem` itself: it inherits the clone
    // by delegating, and losing the delegation is the regression that leaves an
    // org owning a system with no files behind it.
    const service = readFileSync(join(process.cwd(), "src/core/apps/service.ts"), "utf8");
    expect(service).toContain("cloneInstalledSystem(");
    expect(routeSource(ROUTES.approval)).not.toContain("cloneInstalledSystem(");
  });
});

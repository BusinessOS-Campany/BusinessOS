/**
 * Where a system's logout button sends the browser.
 *
 * The grocery app builds that URL by hand (`window.location.href = ...` in the
 * topbar), so it escapes the mount point the app is served under: nothing
 * rewrites a raw assignment the way `next/link` and the router get rewritten.
 * `logoutAction` returned the app's own `/login`, which from
 * `/p967770416171/grocery/dashboard` resolves against the origin to
 * `https://bosc.dpdns.org/login` — a path the platform does not have. Signing
 * out landed on a 404.
 *
 * The destination has to be the platform's `/signin`, at the origin root, and
 * not the system's own login page: the platform session is still alive after a
 * system signs its user out, and `/signin` renders its form unconditionally
 * rather than bouncing a signed-in visitor back into the tenant.
 *
 * Every installed clone is checked too. The five copies are provisioned from the
 * template but are separate working trees, so a fix in `system/grocery` alone
 * leaves every running tenant on the old redirect — which is exactly the drift
 * that has no detector today.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(__dirname, "..", "..");
const VAULT_ROOT = join(REPO_ROOT, "orginazition");

/** The redirect `logoutAction` hands back to the client. */
function logoutRedirect(actionsSource: string): string | undefined {
  const body = /export async function logoutAction\b[\s\S]*?(?=\nexport |\n\}\s*$|$)/.exec(
    actionsSource,
  )?.[0];
  return body ? /redirect:\s*"([^"]+)"/.exec(body)?.[1] : undefined;
}

function actionsPath(...segments: string[]): string {
  return join(...segments, "src", "features", "auth", "actions.ts");
}

const templateSource = readFileSync(
  actionsPath(REPO_ROOT, "system", "grocery"),
  "utf8",
);

/** Every org that has a grocery clone provisioned, by folder name. */
const cloneFolders = readdirSync(VAULT_ROOT, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((org) => existsSync(actionsPath(VAULT_ROOT, org, "systems", "grocery")));

describe("system logout destination", () => {
  it("finds at least one provisioned clone to check", () => {
    expect(cloneFolders.length).toBeGreaterThan(0);
  });

  it("sends the template's logout to the platform sign-in, not to a bare /login", () => {
    expect(logoutRedirect(templateSource)).toBe("/signin");
  });

  it("targets a page the platform actually serves", () => {
    // The bug was invisible at compile time because `/login` is a perfectly valid
    // path *inside* the system app. Only the platform side can say it 404s.
    expect(existsSync(join(REPO_ROOT, "src", "app", "signin", "page.tsx"))).toBe(true);
    expect(existsSync(join(REPO_ROOT, "src", "app", "login", "page.tsx"))).toBe(false);
  });

  it("has no provisioned clone still pointing logout at /login", () => {
    const stale = cloneFolders.filter((org) => {
      const source = readFileSync(
        actionsPath(VAULT_ROOT, org, "systems", "grocery"),
        "utf8",
      );
      return logoutRedirect(source) !== "/signin";
    });
    expect(stale).toEqual([]);
  });

  it("leaves the system's own login route in place for direct sign-in", () => {
    // Only the logout *destination* moves. The route itself stays, or the
    // proxy's unauthenticated redirect and the login form would dead-end.
    expect(existsSync(join(REPO_ROOT, "system", "grocery", "src", "app", "(auth)", "login", "page.tsx"))).toBe(true);
  });
});
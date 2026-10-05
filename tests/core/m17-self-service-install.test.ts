import "@/core/config/load-env";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Self-service install: an org installs a system itself, with no platform
 * approval, whenever the platform actually has a runnable copy of that system's
 * code to give it.
 *
 * The decision is made by a fact on disk, not by a flag. `system/<slug>/` is the
 * pristine master every org's copy is cloned from; if a runnable source is there,
 * the org can be handed its own private copy and its own database immediately. If
 * it is not there, there is nothing to install, and the request goes to the
 * approval queue exactly as it always did — which is the correct answer for the
 * eight catalog systems whose sources are not in this repo.
 *
 * Both env roots are redirected to a sandbox so nothing here touches the real
 * `system/` or `orginazition/`. The system in the sandbox is a minimal but
 * *complete* stand-in: it satisfies the whole runnable contract (health route,
 * link route, migrations, bootstrap, build script, basePath-aware config)
 * because that contract is precisely what this feature keys on, and a stub that
 * satisfied less would be testing the wrong thing.
 */
const sandbox = mkdtempSync(join(tmpdir(), "self-service-install-"));
const sourceRoot = join(sandbox, "system");
const vaultRoot = join(sandbox, "orginazition");
process.env.SYSTEM_SOURCE_PATH = sourceRoot;
process.env.ORG_VAULT_PATH = vaultRoot;

const { prisma } = await import("@/core/db/client");
const { installSystemForOrg, orgSystemNeedsBuild } = await import("@/core/apps/service");
const { orgVaultPaths } = await import("@/core/org-vault/paths");
const { resetRegistryCache } = await import("@/core/org-vault/registry");
const { systemContract } = await import("@/core/org-vault/system-sources");
const { installState } = await import("@/core/systems/catalog");
const { orgSystemPath } = await import("@/core/systems/runtime/urls");

/** The slug whose source exists in the sandbox, and one whose source does not. */
const SOURCED = "grocery";
const UNSOURCED = "pos";

/**
 * Writes a master system that satisfies the full runnable contract, which is
 * what makes it instantly installable. Deliberately trivial in content: the
 * platform never reads a system's code, it only copies it.
 */
function writeRunnableSource(slug: string): void {
  const dir = join(sourceRoot, slug);
  mkdirSync(join(dir, "src", "app", "api", "health"), { recursive: true });
  mkdirSync(join(dir, "src", "app", "api", "bos", "link"), { recursive: true });
  mkdirSync(join(dir, "prisma", "migrations"), { recursive: true });
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: slug, scripts: { build: "next build", start: "next start" } }),
  );
  writeFileSync(join(dir, "next.config.ts"), 'const basePath = process.env.SYSTEM_BASE_PATH ?? "/g";\nexport default { basePath };\n');
  writeFileSync(join(dir, "src", "app", "api", "health", "route.ts"), "export const GET = () => Response.json({ ok: true });\n");
  writeFileSync(join(dir, "src", "app", "api", "bos", "link", "route.ts"), "export const POST = () => Response.json({ ok: true });\n");
  writeFileSync(join(dir, "prisma", "schema.prisma"), "datasource db { provider = \"postgresql\" }\n");
  writeFileSync(join(dir, "prisma", "bootstrap.ts"), "export const bootstrap = async () => {};\n");
  writeFileSync(join(dir, "src", "index.ts"), "export const ok = true;\n");
}

const slug = () => `m17-${randomUUID().slice(0, 8)}`;
const createdAppIds: string[] = [];
/** Seeded catalog rows this run borrowed, which cleanup must leave alone. */
const adoptedAppSlugs: string[] = [];
let orgA = "";
let orgASlug = "";
let userA = "";
let orgB = "";
let orgBSlug = "";
let userB = "";
let sourcedAppId = "";
let unsourcedAppId = "";

async function makeOrg(name: string) {
  const userId = `u-${randomUUID().slice(0, 8)}`;
  await prisma.user.create({
    data: { id: userId, name: `${name} Tester`, emailVerified: false, email: `${slug()}@test.local` },
  });
  const id = randomUUID();
  const orgSlug = slug();
  await prisma.organization.create({ data: { id, name, slug: orgSlug } });
  await prisma.member.create({ data: { id: randomUUID(), organizationId: id, userId, role: "owner" } });
  return { orgId: id, orgSlug, userId };
}

/**
 * A catalog row for `s`, creating it only if the platform does not already have
 * one, and remembering which rows are OURS to delete.
 *
 * `grocery` and `pos` are real seeded catalog apps, not fixtures. This file needs
 * those exact slugs because `openRouteForOrgSlug` only returns an org-scoped path
 * for a system the platform classifies as real, and because the whole point is
 * that those two take different paths through the install. An `upsert` alone
 * would be harmless, but pushing its id onto the delete list would quietly remove
 * the platform's own catalog entry on every run — which is what happened, and
 * which surfaced as an unrelated suite failing with "run the seed".
 */
async function catalogApp(s: string, name: string) {
  const existing = await prisma.app.findUnique({ where: { slug: s }, select: { id: true } });
  if (existing) {
    adoptedAppSlugs.push(s);
    return { id: existing.id, slug: s };
  }
  const entry = await (await import("@/core/apps/service")).upsertCatalogApp({
    slug: s, name, nameAr: name, description: "d", descriptionAr: "و",
    icon: "box", category: "test", version: "1.0.0", routePrefix: `/app/${s}`,
  });
  createdAppIds.push(entry.id);
  return entry;
}

beforeAll(async () => {
  mkdirSync(sourceRoot, { recursive: true });
  writeRunnableSource(SOURCED);
  resetRegistryCache();
  ({ orgId: orgA, orgSlug: orgASlug, userId: userA } = await makeOrg("M17-A"));
  ({ orgId: orgB, orgSlug: orgBSlug, userId: userB } = await makeOrg("M17-B"));
  sourcedAppId = (await catalogApp(SOURCED, "M17 Sourced")).id;
  unsourcedAppId = (await catalogApp(UNSOURCED, "M17 Unsourced")).id;
});

afterAll(async () => {
  for (const oid of [orgA, orgB]) {
    if (!oid) continue;
    await prisma.organizationApp.deleteMany({ where: { organizationId: oid } });
    await prisma.organizationAppRequest.deleteMany({ where: { organizationId: oid } });
    await prisma.auditLog.deleteMany({ where: { organizationId: oid } });
    await prisma.member.deleteMany({ where: { organizationId: oid } });
    await prisma.organization.delete({ where: { id: oid } }).catch(() => undefined);
  }
  for (const id of createdAppIds) {
    await prisma.organizationApp.deleteMany({ where: { appId: id } });
    await prisma.organizationAppRequest.deleteMany({ where: { appId: id } });
    await prisma.app.delete({ where: { id } }).catch(() => undefined);
  }
  // A catalog row this file adopted is left exactly as it was found, and the run
  // fails loudly if it was not — a silently deleted catalog entry is far more
  // expensive to diagnose later than a red suite now.
  for (const s of adoptedAppSlugs) {
    if (!(await prisma.app.findUnique({ where: { slug: s }, select: { id: true } }))) {
      throw new Error(`m17 destroyed the seeded catalog app "${s}"`);
    }
  }
  for (const uid of [userA, userB]) {
    if (uid) await prisma.user.delete({ where: { id: uid } }).catch(() => undefined);
  }
  resetRegistryCache();
  rmSync(sandbox, { recursive: true, force: true });
});

describe("what makes a system instantly installable", () => {
  it("is the runnable contract, read off the master source", () => {
    // The gate, stated once so a reader knows why the two paths below diverge.
    expect(systemContract(SOURCED).missing).toEqual([]);
    expect(systemContract(UNSOURCED).missing.length).toBeGreaterThan(0);
  });
});

describe("self-service install of a system the platform can actually run", () => {
  it("installs immediately, with no approval request", async () => {
    const res = await installSystemForOrg(orgA, { slug: SOURCED, userId: userA });

    expect(res.state).toBe("preparing");
    expect(res.created).toBe(true);
    expect(res.requestId).toBeNull();
    // It leads under the installing org, because that is where its own copy runs.
    expect(res.route).toBe(orgSystemPath(orgASlug, SOURCED));

    const installed = await prisma.organizationApp.findUnique({
      where: { organizationId_appId: { organizationId: orgA, appId: sourcedAppId } },
    });
    expect(installed?.status).toBe("active");
    expect(installed?.activatedAt).not.toBeNull();

    // The whole point: nothing is waiting on a human.
    const pending = await prisma.organizationAppRequest.count({
      where: { organizationId: orgA, appId: sourcedAppId },
    });
    expect(pending).toBe(0);
  });

  it("gives the org its own private copy of the system's code", () => {
    const target = join(orgVaultPaths(orgASlug).systems, SOURCED);
    expect(existsSync(join(target, "package.json"))).toBe(true);
    expect(existsSync(join(target, "src", "app", "api", "bos", "link", "route.ts"))).toBe(true);

    const stamp = JSON.parse(readFileSync(join(target, ".clone.json"), "utf8"));
    expect(stamp.systemSlug).toBe(SOURCED);
    expect(stamp.orgSlug).toBe(orgASlug);

    // The master is never written to: it is shared by every org.
    expect(existsSync(join(sourceRoot, SOURCED, ".clone.json"))).toBe(false);
  });

  it("writes an audit row naming the installer", async () => {
    const rows = await prisma.auditLog.findMany({
      where: { organizationId: orgA, action: "marketplace.app.installed" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].actorUserId).toBe(userA);
    expect(rows[0].entityId).toBe(sourcedAppId);
  });

  it("reports the copy as not yet built until the runtime has run once", () => {
    // A freshly cloned folder has no runtime state, so the first open still has
    // to build. The card needs to know the difference, and this is the fact it
    // is read from.
    expect(orgSystemNeedsBuild(orgASlug, SOURCED)).toBe(true);

    const state = join(orgVaultPaths(orgASlug).systems, SOURCED, ".runtime.json");
    writeFileSync(state, JSON.stringify({ sourceHash: "h", basePath: "/x", builtAt: "now", port: 4100, pid: 1 }));

    expect(orgSystemNeedsBuild(orgASlug, SOURCED)).toBe(false);
  });

  it("re-installing is idempotent: one row, one clone, no second audit row", async () => {
    const target = join(orgVaultPaths(orgASlug).systems, SOURCED);
    const edited = join(target, "src", "index.ts");
    writeFileSync(edited, "// customised by the org\n");

    const again = await installSystemForOrg(orgA, { slug: SOURCED, userId: userA });

    expect(again.state).toBe("installed");
    expect(again.created).toBe(false);
    // The org's own edit survives, which is the whole reason for the clone stamp.
    expect(readFileSync(edited, "utf8")).toBe("// customised by the org\n");

    const rows = await prisma.organizationApp.count({ where: { organizationId: orgA, appId: sourcedAppId } });
    expect(rows).toBe(1);
    const audits = await prisma.auditLog.count({
      where: { organizationId: orgA, action: "marketplace.app.installed", entityId: sourcedAppId },
    });
    expect(audits).toBe(1);
  });

  it("surfaces a built system as installed and an unbuilt one as preparing", () => {
    const built = installState({ appIsActive: true, installed: true, needsBuild: false });
    const unbuilt = installState({ appIsActive: true, installed: true, needsBuild: true });
    expect(built).toBe("installed");
    expect(unbuilt).toBe("preparing");
  });
});

describe("two orgs installing the same system", () => {
  it("gives each its own copy, and neither can see the other's", async () => {
    await installSystemForOrg(orgB, { slug: SOURCED, userId: userB });

    const mine = join(orgVaultPaths(orgASlug).systems, SOURCED, "src", "index.ts");
    const theirs = join(orgVaultPaths(orgBSlug).systems, SOURCED, "src", "index.ts");
    expect(mine).not.toBe(theirs);
    // B gets the pristine master, not the edit A made above.
    expect(readFileSync(theirs, "utf8")).toContain("ok = true");
    expect(readFileSync(mine, "utf8")).toContain("customised");

    // And each one's route is under its own org, never the other's.
    const routeA = await installSystemForOrg(orgA, { slug: SOURCED, userId: userA });
    const routeB = await installSystemForOrg(orgB, { slug: SOURCED, userId: userB });
    expect(routeA.route).toBe(`/${orgASlug}/${SOURCED}`);
    expect(routeB.route).toBe(`/${orgBSlug}/${SOURCED}`);
  });

  it("does not let one org's install satisfy another's", async () => {
    const res = await installSystemForOrg(orgB, { slug: SOURCED, userId: userB });
    // B's own copy was cloned in the test above but never built, so it is
    // `preparing` — and crucially it is B's state, not A's: A's build above did
    // not make B's install look finished.
    expect(res.state).toBe("preparing");
    expect(res.created).toBe(false);

    const aRows = await prisma.organizationApp.count({ where: { organizationId: orgA, appId: sourcedAppId } });
    const bRows = await prisma.organizationApp.count({ where: { organizationId: orgB, appId: sourcedAppId } });
    expect(aRows).toBe(1);
    expect(bRows).toBe(1);
  });
});

describe("a system the platform has no source for", () => {
  it("goes to the approval queue instead of pretending to install", async () => {
    const res = await installSystemForOrg(orgA, { slug: UNSOURCED, userId: userA });

    expect(res.state).toBe("pending");
    expect(res.created).toBe(true);
    expect(res.requestId).toBeTruthy();

    const installed = await prisma.organizationApp.count({
      where: { organizationId: orgA, appId: unsourcedAppId },
    });
    expect(installed).toBe(0);
    const pending = await prisma.organizationAppRequest.count({
      where: { organizationId: orgA, appId: unsourcedAppId, status: "pending" },
    });
    expect(pending).toBe(1);
  });

  it("is idempotent, and a rejected request is reopened", async () => {
    const again = await installSystemForOrg(orgA, { slug: UNSOURCED, userId: userA });
    expect(again.state).toBe("pending");
    expect(again.created).toBe(false);
    expect(
      await prisma.organizationAppRequest.count({ where: { organizationId: orgA, appId: unsourcedAppId } }),
    ).toBe(1);
  });
});

describe("guards that apply to both paths", () => {
  it("refuses a slug the catalog does not have", async () => {
    await expect(installSystemForOrg(orgA, { slug: "no-such-system", userId: userA })).rejects.toThrow();
  });

  it("refuses a system the platform has switched off", async () => {
    const { updateCatalogApp } = await import("@/core/apps/service");
    await updateCatalogApp(UNSOURCED, { isActive: false });
    await expect(installSystemForOrg(orgA, { slug: UNSOURCED, userId: userA })).rejects.toThrow();
    await updateCatalogApp(UNSOURCED, { isActive: true });
  });

  it("refuses an org that does not exist", async () => {
    await expect(
      installSystemForOrg("00000000-0000-0000-0000-000000000000", { slug: SOURCED, userId: userA }),
    ).rejects.toThrow();
  });

  it("never leaves a half-installed org when the clone cannot be written", async () => {
    // The row and the files are one install. If the copy fails the org must not
    // be left holding an install it cannot open.
    const s = slug();
    const entry = await catalogApp(s, "M17 Unclonable");
    // A source that exists but is not runnable is treated as unsourced, so point
    // the catalog at a slug whose master is deliberately absent.
    await prisma.app.update({ where: { id: entry.id }, data: { slug: "m17-absent-master" } });

    const res = await installSystemForOrg(orgA, { slug: "m17-absent-master", userId: userA });
    expect(res.state).toBe("pending");
    expect(
      await prisma.organizationApp.count({ where: { organizationId: orgA, appId: entry.id } }),
    ).toBe(0);
  });
});

import "@/core/config/load-env";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Two grocery systems exist and must never be confused for one another.
 *
 *  - `/demo/grocery` is the platform's own shared demo: one process, one schema
 *    (`grocery_<slug>`), reachable by anyone signed in to anything.
 *  - `/{org}/grocery` is one org's own copy of the code, in its own process,
 *    against its own database (`org_<folder>`).
 *
 * The failure this file exists to prevent is an org reaching its neighbour's data
 * — either by following a link it was handed for a system it never installed, or
 * by presenting a token minted for one of the two systems to the other. Neither
 * shows up by clicking around, because the symptom is a correct-looking page
 * containing the wrong customer's rows.
 *
 * Both env roots are redirected to a sandbox, so nothing here touches the real
 * `system/` or `orginazition/`. Roots are read per call rather than cached at
 * import, so setting them before the dynamic imports below is enough.
 */
const sandbox = mkdtempSync(join(tmpdir(), "org-system-isolation-"));
const sourceRoot = join(sandbox, "system");
const vaultRoot = join(sandbox, "orginazition");
process.env.SYSTEM_SOURCE_PATH = sourceRoot;
process.env.ORG_VAULT_PATH = vaultRoot;

const { prisma } = await import("@/core/db/client");
const { installSystemForOrg, upsertCatalogApp } = await import("@/core/apps/service");
const { proxySystemRequest } = await import("@/core/systems/runtime/proxy");
const { getVaultEntry, resetRegistryCache, upsertVaultEntry } = await import("@/core/org-vault/registry");
const { orgVaultPaths } = await import("@/core/org-vault/paths");
const { openRouteForOrgSlug } = await import("@/core/systems/catalog");
const { issueOrgToken, verifyOrgToken } = await import("@/core/systems/runtime/org-token");
const { issueGroceryGatewayToken, verifyGroceryGatewayToken } = await import("@/core/auth/grocery-gateway");
const { orgDatabaseName } = await import("@/core/org-vault/database");
const { DEMO_SYSTEMS } = await import("@/core/demo/demo-systems");

const SYSTEM = "grocery";
/**
 * Catalog rows this file created, and only those.
 *
 * `grocery` is a REAL seeded catalog app, not a throwaway: it is the platform's
 * live grocery listing, and the test needs that exact slug because
 * `openRouteForOrgSlug` only returns an org-scoped path for a real system. So
 * cleanup is tracked rather than inferred — deleting "whatever this file touched"
 * on a slug the seed owns would quietly remove the platform's own catalog entry,
 * and the next test that reads it fails with "run the seed" pointing at a seed
 * that was never the thing at fault.
 */
const createdAppIds: string[] = [];
let adoptedExistingApp = false;
let orgA = "";
let orgASlug = "";
let userA = "";
let orgB = "";
let orgBSlug = "";
let userB = "";

/** A master system that satisfies the whole runnable contract. */
function writeRunnableSource(slug: string): void {
  const dir = join(sourceRoot, slug);
  mkdirSync(join(dir, "src", "app", "api", "health"), { recursive: true });
  mkdirSync(join(dir, "src", "app", "api", "bos", "link"), { recursive: true });
  mkdirSync(join(dir, "prisma"), { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: slug, scripts: { build: "next build", start: "next start" } }));
  writeFileSync(join(dir, "next.config.ts"), 'const basePath = process.env.SYSTEM_BASE_PATH ?? "/g";\nexport default { basePath };\n');
  writeFileSync(join(dir, "src", "app", "api", "health", "route.ts"), "export const GET = () => Response.json({ ok: true });\n");
  writeFileSync(join(dir, "src", "app", "api", "bos", "link", "route.ts"), "export const POST = () => Response.json({ ok: true });\n");
  writeFileSync(join(dir, "prisma", "schema.prisma"), 'datasource db { provider = "postgresql" }\n');
  writeFileSync(join(dir, "prisma", "bootstrap.ts"), "export const bootstrap = async () => {};\n");
}

async function makeOrg(name: string) {
  const userId = `u-${randomUUID().slice(0, 8)}`;
  await prisma.user.create({
    data: { id: userId, name: `${name} Tester`, emailVerified: false, email: `iso-${randomUUID().slice(0, 8)}@test.local` },
  });
  const id = randomUUID();
  const orgSlug = `iso-${randomUUID().slice(0, 8)}`;
  await prisma.organization.create({ data: { id, name, slug: orgSlug } });
  await prisma.member.create({ data: { id: randomUUID(), organizationId: id, userId, role: "owner" } });
  return { orgId: id, orgSlug, userId };
}

function scopeFor(organizationId: string, organizationSlug: string, userId: string, name: string) {
  return {
    organizationId,
    organizationSlug,
    organizationName: name,
    userId,
    role: "owner",
    email: `${userId}@test.local`,
    name,
  };
}

beforeAll(async () => {
  mkdirSync(sourceRoot, { recursive: true });
  writeRunnableSource(SYSTEM);
  resetRegistryCache();
  ({ orgId: orgA, orgSlug: orgASlug, userId: userA } = await makeOrg("ISO-A"));
  ({ orgId: orgB, orgSlug: orgBSlug, userId: userB } = await makeOrg("ISO-B"));

  // The real `grocery` app row is adopted rather than recreated: the install path
  // needs a catalog app for this slug, and creating a second one is impossible
  // (slug is unique) while deleting the seeded one in cleanup is not allowed.
  const existing = await prisma.app.findUnique({ where: { slug: SYSTEM }, select: { id: true } });
  if (existing) {
    adoptedExistingApp = true;
  } else {
    const entry = await upsertCatalogApp({
      slug: SYSTEM, name: "ISO Grocery", nameAr: "بقالة", description: "d", descriptionAr: "و",
      icon: "store", category: "test", version: "1.0.0", routePrefix: `/app/${SYSTEM}`,
    });
    createdAppIds.push(entry.id);
  }
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
    await prisma.app.delete({ where: { id } }).catch(() => undefined);
  }
  // A catalog row this file adopted is left exactly as it was found.
  if (adoptedExistingApp) {
    const app = await prisma.app.findUnique({ where: { slug: SYSTEM }, select: { id: true } });
    if (!app) throw new Error(`test destroyed the seeded catalog app "${SYSTEM}"`);
  }
  for (const uid of [userA, userB]) {
    if (uid) await prisma.user.delete({ where: { id: uid } }).catch(() => undefined);
  }
  resetRegistryCache();
  rmSync(sandbox, { recursive: true, force: true });
});

describe("reaching an org's system at all", () => {
  it("refuses an org that has not installed it, without starting anything", async () => {
    // B has a vault folder — it signed up normally — but installed nothing.
    await upsertVaultEntry({ slug: orgBSlug, orgId: orgB });

    const { response } = await proxySystemRequest(
      SYSTEM,
      [],
      new Request("https://localhost:3100/anything"),
      scopeFor(orgB, orgBSlug, userB, "ISO-B"),
    );

    // The gate: 403 rather than a booted runtime pointed at an org that never
    // asked for this system.
    expect(response.status).toBe(403);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("SYSTEM_NOT_INSTALLED");
  });

  it("refuses an org whose vault was never provisioned at all", async () => {
    const { response } = await proxySystemRequest(
      SYSTEM,
      [],
      new Request("https://localhost:3100/anything"),
      scopeFor(orgA, "iso-never-provisioned", userA, "Ghost"),
    );

    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("SYSTEM_NOT_PROVISIONED");
  });

  it("gives an org its own path, and never another org's", async () => {
    const res = await installSystemForOrg(orgA, { slug: SYSTEM, userId: userA });
    expect(res.route).toBe(`/${orgASlug}/${SYSTEM}`);

    expect(openRouteForOrgSlug(SYSTEM, orgASlug)).toBe(`/${orgASlug}/${SYSTEM}`);
    expect(openRouteForOrgSlug(SYSTEM, orgBSlug)).toBe(`/${orgBSlug}/${SYSTEM}`);
  });

  it("gives the org its own database, not the shared one and not a neighbour's", async () => {
    const entry = getVaultEntry(orgASlug);
    expect(entry).not.toBeNull();
    expect(entry!.databaseName).toBe(orgDatabaseName(orgASlug));
    expect(entry!.databaseName).not.toContain("businessos");
    expect(entry!.databaseName).not.toBe(orgDatabaseName(orgBSlug));
  });

  it("keeps the two orgs' copies in separate folders", async () => {
    expect(orgVaultPaths(orgASlug).systems).not.toBe(orgVaultPaths(orgBSlug).systems);
  });
});

describe("the two grocery systems cannot be used for one another", () => {
  it("a per-org token carries no schema, and is not accepted as a demo token", () => {
    const orgToken = issueOrgToken(scopeFor(orgA, orgASlug, userA, "A"));
    const orgPayload = verifyOrgToken(orgToken);
    expect(orgPayload?.organizationId).toBe(orgA);
    // The per-org system gets a whole database, so there is no schema to name.
    expect(orgPayload).not.toHaveProperty("schemaName");

    // The demo app's verifier requires a schema name, so it rejects this outright.
    expect(verifyGroceryGatewayToken(orgToken)).toBeNull();
  });

  it("a demo token names a schema and is refused by the per-org verifier", () => {
    // The demo verifier only accepts `grocery_<lowercase alnum + underscore>`,
    // so the schema name is built from the digits rather than the org slug — the
    // point of the test is which verifier accepts which token, not slug hygiene.
    const schemaName = `grocery_isotest${randomUUID().slice(0, 8)}`;
    const demoToken = issueGroceryGatewayToken({
      organizationId: orgA,
      userId: userA,
      role: "owner",
      schemaName,
    });
    expect(verifyGroceryGatewayToken(demoToken)?.schemaName).toBe(schemaName);

    // A per-org clone is handed a DATABASE, never a schema name, so a token
    // carrying one is not one of its own.
    expect(verifyOrgToken(demoToken)).toBeNull();
  });

  it("the two mounts are separate paths", () => {
    const demo = DEMO_SYSTEMS.find((s) => s.slug === SYSTEM);
    expect(demo?.rootPath).toBe(`/demo/${SYSTEM}`);

    const orgPath = `/${orgASlug}/${SYSTEM}`;
    expect(orgPath).not.toBe(demo?.rootPath);
    expect(orgPath.startsWith("/demo/")).toBe(false);
  });
});

describe("sandbox", () => {
  it("is a temp directory, not the real vault", () => {
    expect(process.env.ORG_VAULT_PATH).toBe(vaultRoot);
    expect(orgVaultPaths(orgASlug).root.startsWith(vaultRoot)).toBe(true);
  });
});

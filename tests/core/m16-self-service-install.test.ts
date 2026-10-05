import "@/core/config/load-env";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/core/db/client";
import {
  requestSystemForTenant,
  updateCatalogApp,
  upsertCatalogApp,
  deleteCatalogApp,
  getCustomerMarketplace,
} from "@/core/apps/service";
import { tenantFilter } from "@/core/db/tenant-guard";
import { catalogSeedRows } from "@/core/systems/catalog-seed";

// M16 — adding a system ALWAYS asks the platform admin first (no instant
// self-service install). Service level; route-level guards are verified live:
// session orgId + systems:install on POST /api/v1/apps/[slug]/request (and the
// /install alias, which now funnels into the same queue).
// Fails-first: request-not-install, idempotent pending, rejected-reopen,
// disabled/soon refuse, installed reports installed, cross-tenant isolated.

const slug = () => `m16-${randomUUID().slice(0, 8)}`;

let orgA = "";
let orgB = "";
let userA = "";
let userB = "";
let appId = "";
const appSlug = slug();
const createdAppIds: string[] = [];
/** Seeded catalog rows this run borrowed, which cleanup must leave alone. */
const adoptedAppSlugs: string[] = [];

async function makeOrg(name: string): Promise<{ orgId: string; userId: string }> {
  const userId = `u-${randomUUID().slice(0, 8)}`;
  await prisma.user.create({
    data: { id: userId, name: `${name} Tester`, emailVerified: false, email: `${slug()}@test.local` },
  });
  const orgId = randomUUID();
  await prisma.organization.create({ data: { id: orgId, name, slug: slug() } });
  await prisma.member.create({
    data: { id: randomUUID(), organizationId: orgId, userId, role: "owner" },
  });
  return { orgId, userId };
}

beforeAll(async () => {
  ({ orgId: orgA, userId: userA } = await makeOrg("M16-A"));
  ({ orgId: orgB, userId: userB } = await makeOrg("M16-B"));
});

afterAll(async () => {
  for (const oid of [orgA, orgB]) {
    if (!oid) continue;
    await prisma.organizationApp.deleteMany({ where: { organizationId: oid } });
    await prisma.organizationAppRequest.deleteMany({ where: { organizationId: oid } });
    await prisma.member.deleteMany({ where: { organizationId: oid } });
    await prisma.product.deleteMany({ where: { organizationId: oid } });
    await prisma.organization.delete({ where: { id: oid } }).catch(() => undefined);
  }
  for (const id of createdAppIds) {
    await prisma.organizationApp.deleteMany({ where: { appId: id } });
    await prisma.organizationAppRequest.deleteMany({ where: { appId: id } });
    await prisma.app.delete({ where: { id } }).catch(() => undefined);
  }
  // A borrowed catalog row must survive the run. Failing loudly here is the whole
  // point: a silently deleted system disappears from the marketplace for every
  // customer, and no other test would notice.
  for (const s of adoptedAppSlugs) {
    if (!(await prisma.app.findUnique({ where: { slug: s }, select: { id: true } }))) {
      throw new Error(`m16 destroyed the seeded catalog app "${s}"`);
    }
  }
  for (const uid of [userA, userB]) {
    if (uid) await prisma.user.delete({ where: { id: uid } }).catch(() => undefined);
  }
});

describe("system request (platform approval) flow", () => {
  it("creates a catalog app with image + schemaKey (admin catalog)", async () => {
    const entry = await upsertCatalogApp({
      slug: appSlug,
      name: "M16 Test System",
      nameAr: "نظام اختبار",
      description: "d",
      descriptionAr: "و",
      icon: "box",
      image: "https://example.com/m16.png",
      schemaKey: "m16_test",
      category: "test",
      version: "1.0.0",
      routePrefix: "/app/m16-test",
    });
    appId = entry.id;
    createdAppIds.push(entry.id);
    expect(entry.image).toBe("https://example.com/m16.png");
    expect(entry.schemaKey).toBe("m16_test");

    const patched = await updateCatalogApp(appSlug, { image: "", schemaKey: "" });
    expect(patched?.image).toBeNull();
    expect(patched?.schemaKey).toBeNull();
    await updateCatalogApp(appSlug, { image: "https://example.com/m16.png", schemaKey: "m16_test" });
  });

  it("requesting a system creates a pending approval request, NOT an install", async () => {
    const res = await requestSystemForTenant(orgA, { slug: appSlug, userId: userA });
    expect(res.state).toBe("pending");
    expect(res.created).toBe(true);
    expect(res.requestId).toBeTruthy();
    expect(res.route).toBeNull();

    const installed = await prisma.organizationApp.count({ where: { organizationId: orgA, appId } });
    expect(installed).toBe(0);
    const pendingRows = await prisma.organizationAppRequest.count({
      where: { organizationId: orgA, appId, status: "pending" },
    });
    expect(pendingRows).toBe(1);
  });

  it("Tenant B's request for the same system is its own separate request", async () => {
    const res = await requestSystemForTenant(orgB, { slug: appSlug, userId: userB });
    expect(res.state).toBe("pending");
    const rows = await prisma.organizationAppRequest.findMany({ where: { appId } });
    expect(rows.map((r) => r.organizationId).sort()).toEqual([orgA, orgB].sort());
  });

  it("repeat request is idempotent — one pending row, no duplicate", async () => {
    const res = await requestSystemForTenant(orgA, { slug: appSlug, userId: userA });
    expect(res.state).toBe("pending");
    expect(res.created).toBe(false);
    const count = await prisma.organizationAppRequest.count({
      where: { organizationId: orgA, appId, status: "pending" },
    });
    expect(count).toBe(1);
  });

  it("an already-installed system reports installed and raises no request", async () => {
    const s = slug();
    const e = await upsertCatalogApp({
      slug: s, name: "M16 Installed", nameAr: "مثبت", description: "d", descriptionAr: "و",
      icon: "box", category: "test", version: "1.0.0", routePrefix: "/app/m16-installed",
    });
    createdAppIds.push(e.id);
    await prisma.organizationApp.create({
      data: { id: randomUUID(), organizationId: orgA, appId: e.id, status: "active", version: "1.0.0", activatedAt: new Date() },
    });

    const res = await requestSystemForTenant(orgA, { slug: s, userId: userA });
    expect(res.state).toBe("installed");
    expect(res.requestId).toBeNull();
    const pending = await prisma.organizationAppRequest.count({ where: { organizationId: orgA, appId: e.id } });
    expect(pending).toBe(0);
  });

  it("a rejected request is reopened as pending on the next request", async () => {
    const s2 = slug();
    const e2 = await upsertCatalogApp({
      slug: s2, name: "M16 Rejected", nameAr: "مرفوض", description: "d", descriptionAr: "و",
      icon: "box", category: "test", version: "1.0.0", routePrefix: "/app/m16-rejected",
    });
    createdAppIds.push(e2.id);
    const rejected = await prisma.organizationAppRequest.create({
      data: {
        id: randomUUID(), organizationId: orgA, appId: e2.id, requestedByUserId: userA,
        status: "rejected", decidedByUserId: "platform-admin", decidedAt: new Date(), rejectReason: "nope",
      },
    });

    const res = await requestSystemForTenant(orgA, { slug: s2, userId: userA });
    expect(res.state).toBe("pending");
    expect(res.requestId).toBe(rejected.id);

    const row = await prisma.organizationAppRequest.findUnique({ where: { id: rejected.id } });
    expect(row?.status).toBe("pending");
    expect(row?.rejectReason).toBeNull();
    const pending = await prisma.organizationAppRequest.count({ where: { organizationId: orgA, appId: e2.id, status: "pending" } });
    expect(pending).toBe(1);
  });

  it("tenant data never leaks across tenants", async () => {
    await prisma.product.create({
      data: { organizationId: orgA, sku: `M16-${randomUUID().slice(0, 6)}`, nameAr: "منتج أ", costPrice: 100n, salePrice: 200n, taxRateBps: 0 },
    });
    const seenFromB = await prisma.product.findMany({
      where: tenantFilter({ organizationId: orgB }, {}),
    });
    expect(seenFromB.map((p) => p.organizationId)).not.toContain(orgA);
    const seenFromA = await prisma.product.findMany({
      where: tenantFilter({ organizationId: orgA }, {}),
    });
    expect(seenFromA.length).toBeGreaterThan(0);
  });

  it("marketplace reflects the pending state per tenant", async () => {
    const market = await getCustomerMarketplace(orgA, userA);
    const entry = market.find((m) => m.slug === appSlug);
    expect(entry?.state).toBe("pending");
    expect(entry?.image).toBe("https://example.com/m16.png");
    expect(entry?.schemaKey).toBe("m16_test");
  });

  it("disabled systems refuse new requests; soon systems refuse too", async () => {
    // Disabled = platform kill-switch.
    await updateCatalogApp(appSlug, { isActive: false });
    await expect(requestSystemForTenant(orgA, { slug: appSlug, userId: userA })).rejects.toThrow();
    await updateCatalogApp(appSlug, { isActive: true });

    // Excerpted-but-not-built: a soon slug registered in the catalog refuses the
    // moment the guard sees the curated status, exact same path a customer hits.
    //
    // The slug has to be a REAL curated "soon" slug, because that is where the
    // guard reads the status from — a synthetic slug would not be "soon" at all
    // and the test would pass for the wrong reason. So this borrows a seeded
    // catalog row and must not delete it: pushing its id onto `createdAppIds` made
    // every full-suite run quietly remove a real system from the marketplace
    // (`veterinary`, the first "soon" row), which nothing noticed because no test
    // asserts the curated catalog is still in the database afterwards.
    const soonRow = catalogSeedRows().find((r) => r.soon);
    if (soonRow) {
      const existing = await prisma.app.findUnique({ where: { slug: soonRow.slug }, select: { id: true } });
      if (existing) {
        adoptedAppSlugs.push(soonRow.slug);
      } else {
        const e3 = await upsertCatalogApp({
          slug: soonRow.slug,
          name: "M16 Soon",
          nameAr: "قريباً",
          description: "d",
          descriptionAr: "و",
          icon: "box",
          category: "test",
          version: "1.0.0",
          routePrefix: soonRow.routePrefix,
        });
        createdAppIds.push(e3.id);
      }
      await expect(requestSystemForTenant(orgA, { slug: soonRow.slug, userId: userA })).rejects.toThrow();
    }
  });

  it("a system cannot be deleted from the catalog while it is requested", async () => {
    await expect(deleteCatalogApp(appSlug)).rejects.toThrow();
  });
});
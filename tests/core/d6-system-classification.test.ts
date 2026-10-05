import "@/core/config/load-env";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/core/db/client";
import { getCustomerMarketplace } from "@/core/apps/service";
import { listSystemSources } from "@/core/org-vault/system-clone";
import { openRouteForOrgSlug, systemKind, DEMO_CATALOG_META } from "@/core/systems/catalog";

// D6 — a system the platform runs per org is NOT the same thing as a system with
// an in-shell `/app/<slug>` module, and until D6 one lookup (`REAL_SYSTEM_ROUTES`)
// answered both questions. Grocery satisfies both, so nothing looked wrong.
// Dental does not: it has a runnable `system/dental/` source the platform can
// clone and serve at `/{org}/dental`, and no in-shell module. So the single
// lookup fell through to the demo registry and reported `demo` — which made the
// marketplace offer an org a link to a system it did not own, report a freshly
// cloned copy as `installed` while it still had no build, and point a customer
// who HAD installed dental at `/demo/dental` instead of their own copy.
//
// Fails-first: the misclassification, the wrong org route, and all three
// marketplace symptoms. Then the regressions that must NOT change: in-shell
// modules keep their `/app` route, demo-only systems stay `demo`, and a caller
// that passes no source list gets exactly the old answer.

let orgA = "";
let userA = "";
let orgASlug = "";
let dentalAppId = "";

const tag = () => randomUUID().slice(0, 8);

beforeAll(async () => {
  userA = `u-${tag()}`;
  await prisma.user.create({
    data: { id: userA, name: "D6 Tester", emailVerified: false, email: `${tag()}@test.local` },
  });
  orgA = randomUUID();
  orgASlug = `d6-${tag()}`;
  await prisma.organization.create({ data: { id: orgA, name: "D6 Org", slug: orgASlug } });
  await prisma.member.create({
    data: { id: randomUUID(), organizationId: orgA, userId: userA, role: "owner" },
  });

  // Borrowed, never deleted: these are real seeded catalog rows and removing one
  // would drop a system from every customer's marketplace.
  dentalAppId = (await prisma.app.findUnique({ where: { slug: "dental" }, select: { id: true } }))!.id;
});

afterAll(async () => {
  if (orgA) {
    await prisma.organizationApp.deleteMany({ where: { organizationId: orgA } });
    await prisma.organizationAppRequest.deleteMany({ where: { organizationId: orgA } });
    await prisma.member.deleteMany({ where: { organizationId: orgA } });
    await prisma.organization.delete({ where: { id: orgA } }).catch(() => undefined);
  }
  if (userA) await prisma.user.delete({ where: { id: userA } }).catch(() => undefined);
});

describe("D6: per-org source is not the same fact as having an in-shell module", () => {
  it("classifies a cloneable per-org system as real even when it also has a public demo", async () => {
    const sources = await listSystemSources();
    expect(sources).toContain("dental");
    expect(systemKind("dental", sources)).toBe("real");
  });

  it("routes an org to its OWN copy of dental, not to the public demo", async () => {
    const sources = await listSystemSources();
    expect(openRouteForOrgSlug("dental", "acme", sources)).toBe("/acme/dental");
  });

  it("still classifies a demo-only system as demo and leaves it on its own route", async () => {
    const sources = await listSystemSources();
    expect(sources).not.toContain("pharmacy");
    expect(systemKind("pharmacy", sources)).toBe("demo");
    expect(openRouteForOrgSlug("pharmacy", "acme", sources)).toBe("/pharmacy");
  });

  it("leaves an in-shell module on /app/<slug> when no org is known", async () => {
    const sources = await listSystemSources();
    expect(openRouteForOrgSlug("grocery", null, sources)).toBe("/app/grocery");
    expect(openRouteForOrgSlug("grocery", "acme", sources)).toBe("/acme/grocery");
    expect(systemKind("grocery", sources)).toBe("real");
    expect(systemKind("sama-center", sources)).toBe("real");
  });

  it("answers exactly as before when a caller passes no source list", async () => {
    expect(systemKind("dental")).toBe("demo");
    expect(openRouteForOrgSlug("dental", "acme")).toBe("/demo/dental");
    expect(systemKind("unknown-slug")).toBe("none");
  });
});

describe("D6: marketplace for a cloneable per-org system", () => {
  it("offers an org no route to a system it has not installed", async () => {
    const market = await getCustomerMarketplace(orgA, userA);
    const dental = market.find((m) => m.slug === "dental");
    expect(dental?.kind).toBe("real");
    // Not installed + no clone: handing back `/{org}/dental` produces a link the
    // proxy answers 403 on, and `/demo/dental` promises a copy the org does not own.
    expect(dental?.route).toBeNull();
  });

  it("reports an uninstalled dental as installable, not as an instant demo", async () => {
    const market = await getCustomerMarketplace(orgA, userA);
    const dental = market.find((m) => m.slug === "dental");
    // `installableCardIds` already counts dental installable (it has a source),
    // so a card that says "demo" contradicts the marketplace's own gate.
    expect(dental?.state).toBe("installable");
  });

  it("reports an installed but unbuilt dental as preparing", async () => {
    await prisma.organizationApp.create({
      data: {
        id: randomUUID(),
        organizationId: orgA,
        appId: dentalAppId,
        status: "active",
        version: "1.0.0",
        activatedAt: new Date(),
      },
    });

    const market = await getCustomerMarketplace(orgA, userA);
    const dental = market.find((m) => m.slug === "dental");
    // This org's folder has no `.runtime.json`, so the clone has never been built.
    // Claiming "installed" here is the blank-page bug `preparing` exists to prevent.
    expect(dental?.state).toBe("preparing");
  });

  it("points an installed dental at the org's own mount", async () => {
    const market = await getCustomerMarketplace(orgA, userA);
    const dental = market.find((m) => m.slug === "dental");
    expect(dental?.route).toBe(`/${orgASlug}/dental`);
  });

  it("leaves a demo-only system's card alone", async () => {
    const market = await getCustomerMarketplace(orgA, userA);
    const pharmacy = market.find((m) => m.slug === "pharmacy");
    expect(pharmacy?.kind).toBe("demo");
    expect(pharmacy?.state).toBe("demo");
  });
});

describe("D6: catalog metadata must not label a cloneable system a demo", () => {
  it("gives no demo-seeded entry a -demo version for a system an org can clone", async () => {
    const sources = await listSystemSources();
    // Dental is half-registered in two worlds: it is a public demo at
    // /demo/dental AND a system an org clones and owns. The legacy demo seeder
    // gave its catalog row `version: "1.0.0-demo"`, the approval copied that onto
    // organizationApp, and the profile printed it as `v1.0.0-demo` on a card whose
    // clone was running. Grocery is the counter-example that settles it: grocery is
    // also both real and demo, and its catalog version is a plain `1.0.0`.
    const offenders = DEMO_CATALOG_META.filter(
      (m) => sources.includes(m.slug) && m.version.endsWith("-demo"),
    ).map((m) => `${m.slug}@${m.version}`);
    expect(offenders).toEqual([]);
  });
});
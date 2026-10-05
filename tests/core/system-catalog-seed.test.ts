import "@/core/config/load-env";
import { describe, expect, it } from "vitest";
import { catalogSeedRows, availableSeedRows } from "@/core/systems/catalog-seed";
import { SYSTEMS } from "@/core/demo/systems-catalog";
import { REAL_SYSTEM_SLUGS, installState } from "@/core/systems/catalog";
import { prisma } from "@/core/db/client";

/**
 * The 196 curated systems were written down in `systems-catalog` and invisible
 * to customers, because nothing put them in the `app` table. These guard the
 * mapping that does, which is the part that can quietly go wrong: a bad slug is
 * unreachable, a collision with a real in-shell system would re-point a live
 * tenant, and a "coming soon" system marked installable is a promise the product
 * cannot keep.
 */
describe("catalog seed mapping", () => {
  const rows = catalogSeedRows();

  it("maps every curated catalog system, with no extras", () => {
    expect(rows).toHaveLength(SYSTEMS.length);
    expect(rows.map((r) => r.slug)).toEqual(SYSTEMS.map((s) => s.id));
  });

  it("produces slugs the catalog API would accept", () => {
    // Same rule `catalogAppSchema` enforces, so a seeded row is indistinguishable
    // from one an admin could have created by hand.
    for (const r of rows) {
      expect(r.slug, r.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(r.slug.length).toBeGreaterThanOrEqual(2);
      expect(r.slug.length).toBeLessThanOrEqual(64);
    }
  });

  it("never re-points a real in-shell system", () => {
    // grocery / sama-center are routed by REAL_SYSTEM_ROUTES and already have
    // rows tenants are installed against. Re-using their slug for a catalog entry
    // would redirect a working tenant to a demo proxy.
    for (const slug of REAL_SYSTEM_SLUGS) {
      expect(rows.map((r) => r.slug), slug).not.toContain(slug);
    }
  });

  it("has unique slugs", () => {
    expect(new Set(rows.map((r) => r.slug)).size).toBe(rows.length);
  });

  it("keeps bilingual copy, so neither locale renders an empty card", () => {
    for (const r of rows) {
      expect(r.name.trim(), r.slug).not.toBe("");
      expect(r.nameAr.trim(), r.slug).not.toBe("");
      expect(r.description.trim(), r.slug).not.toBe("");
      expect(r.descriptionAr.trim(), r.slug).not.toBe("");
    }
  });

  it("marks only systems with a live destination as available", () => {
    for (const r of rows) {
      if (r.soon) {
        // A coming-soon system must not advertise somewhere to go, and its
        // placeholder must not collide with a real route.
        expect(r.routePrefix, r.slug).toBe(`/system/${r.slug}`);
      } else {
        expect(r.routePrefix, r.slug).toMatch(/^\//);
        expect(r.routePrefix, r.slug).not.toBe(`/system/${r.slug}`);
      }
    }
    expect(availableSeedRows().length).toBeGreaterThan(0);
    expect(availableSeedRows().length).toBeLessThan(rows.length);
  });

  it("classifies availability exactly as the curated catalog does", () => {
    for (const r of rows) {
      const system = SYSTEMS.find((s) => s.id === r.slug);
      expect(r.soon, r.slug).toBe(system?.status !== "available");
    }
  });
});

describe("the seeded catalog is actually in the database", () => {
  it("has a row for every curated system, so none has silently vanished", async () => {
    // Nothing else in the suite checks this, and the failure it prevents is
    // invisible from the tests: a test that adopts a real catalog slug in order to
    // exercise a real guard, then deletes it in `afterAll` as if it had created
    // it, removes that system from the marketplace for every customer while the
    // whole suite stays green. That happened to `veterinary` on every full run.
    const present = await prisma.app.findMany({ select: { slug: true } });
    const have = new Set(present.map((r) => r.slug));
    const missing = catalogSeedRows()
      .map((r) => r.slug)
      .filter((slug) => !have.has(slug));

    expect(missing, "run: npx tsx scripts/seed-full-catalog.ts").toEqual([]);
  });

  it("still holds the two real in-shell systems tenants are installed against", async () => {
    // `grocery` and `sama-center` are the slugs `REAL_SYSTEM_ROUTES` resolves and
    // the slugs an org's own copy is mounted under. Losing either breaks every
    // installed org, and again nothing else would fail.
    const real = await prisma.app.findMany({
      where: { slug: { in: [...REAL_SYSTEM_SLUGS] } },
      select: { slug: true },
    });
    expect(real.map((r) => r.slug).sort()).toEqual([...REAL_SYSTEM_SLUGS].sort());
  });
});

describe("installState: coming soon", () => {
  it("reports a soon system as soon, not as installable", () => {
    expect(installState({ appIsActive: true, installed: false, soon: true })).toBe("soon");
  });

  it("keeps the platform kill-switch stronger than the catalog", () => {
    // An admin disabling a listed system must not have the card keep promising it.
    expect(installState({ appIsActive: false, soon: true })).toBe("unavailable");
  });

  it("still opens a system the tenant already has", () => {
    // Ordering matters: `installed` is checked before `soon` so a tenant that
    // already owns it is never told it does not exist yet.
    expect(installState({ appIsActive: true, installed: true, soon: true })).toBe("installed");
  });

  it("leaves every pre-existing branch unchanged", () => {
    expect(installState({ appIsActive: false, installed: true, hasPendingRequest: true, isDemo: true })).toBe(
      "unavailable",
    );
    expect(installState({ appIsActive: true, installed: true })).toBe("installed");
    expect(installState({ appIsActive: true, hasPendingRequest: true })).toBe("pending");
    expect(installState({ appIsActive: true, isDemo: true })).toBe("demo");
    expect(installState({ appIsActive: true })).toBe("installable");
  });
});

import { SYSTEMS, CATEGORY_MAP } from "@/core/demo/systems-catalog";
import { REAL_SYSTEM_SLUGS } from "@/core/systems/catalog";

/**
 * Maps the curated `systems-catalog` onto `app` catalog rows.
 *
 * The catalog is the single source of truth (see `systems-catalog.ts`: "never
 * hard-code cards"). The marketplace and the tenant app list read the `app`
 * table, so a catalog system only appears to a customer once it has a row here
 * - which is why the 196 curated systems were invisible despite already being
 * written down.
 *
 * Kept pure and dependency-free so the mapping invariants are unit-testable
 * without a database (tests/core/system-catalog-seed.test.ts). The writer lives
 * in `scripts/seed-full-catalog.ts`.
 */

export interface CatalogSeedRow {
  slug: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  icon: string;
  category: string;
  version: string;
  routePrefix: string;
  /**
   * Listed in the catalog but not built yet.
   *
   * Deliberately NOT encoded as `app.is_active = false`. That flag is the
   * platform kill-switch and reads as "the administrator switched this off" in
   * the admin systems manager, which is a different and much stronger claim than
   * "we have not finished it". Marking 185 rows disabled would also be
   * indistinguishable from 185 broken rows.
   *
   * Not-instalability is instead enforced where it cannot be bypassed: the
   * install service refuses a catalog "soon" system, so hiding the button in the
   * UI is presentation and the guard is the real control.
   */
  soon: boolean;
}

/** Same kebab-case rule the admin catalog API enforces on `slug`. */
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Placeholder route for a system that has no live destination yet.
 *
 * `app.route_prefix` is NOT NULL, so a coming-soon card still needs a value.
 * This path deliberately does not exist: nothing links to it, because the state
 * machine renders such cards as non-interactive.
 */
function placeholderRoute(slug: string): string {
  return `/system/${slug}`;
}

/**
 * Build the rows to seed, validating as it goes.
 *
 * Throws rather than skipping on a bad id: a silently dropped system is
 * indistinguishable from one that was never written down, which is exactly the
 * failure this seed exists to fix.
 */
export function catalogSeedRows(): CatalogSeedRow[] {
  const seen = new Set<string>();
  const rows: CatalogSeedRow[] = [];

  for (const system of SYSTEMS) {
    const slug = system.id;

    if (!SLUG_RE.test(slug)) {
      throw new Error(`catalog id "${slug}" is not a valid app slug (lowercase kebab-case)`);
    }
    if (seen.has(slug)) {
      throw new Error(`duplicate catalog id "${slug}"`);
    }
    seen.add(slug);

    // The real in-shell modules (grocery, sama-center) are routed by
    // REAL_SYSTEM_ROUTES and already have rows that tenants have installed
    // against. Re-pointing one of those rows at a demo proxy would silently
    // break a live tenant, so this refuses instead of overwriting.
    if (REAL_SYSTEM_SLUGS.includes(slug)) {
      throw new Error(
        `catalog id "${slug}" collides with a real in-shell system; the existing app row must not be re-pointed`,
      );
    }

    const available = system.status === "available";

    rows.push({
      slug,
      name: system.nameEn,
      nameAr: system.nameAr,
      description: system.descEn,
      descriptionAr: system.descAr,
      icon: system.icon,
      // Raw category id ("health", "retail", ...), matching how the existing
      // catalog rows store it. CATEGORY_MAP is the source for display titles.
      category: CATEGORY_MAP[system.category] ? system.category : "business",
      version: "1.0.0",
      routePrefix: available ? (system.href ?? placeholderRoute(slug)) : placeholderRoute(slug),
      soon: !available,
    });
  }

  return rows;
}

/** Catalog systems that can actually be opened today. */
export function availableSeedRows(): CatalogSeedRow[] {
  return catalogSeedRows().filter((r) => !r.soon);
}

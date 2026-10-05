import { z } from "zod";
import { liveHref } from "@/core/demo/systems-catalog";
import { orgSystemPath } from "@/core/systems/runtime/urls";

/**
 * System catalog pure logic.
 *
 * Single source of truth consumed by BOTH the admin "systems" manager and the
 * customer marketplace:
 *  - open-route resolution (real in-shell module vs proxied demo)
 *  - demo classification (demo systems are instantly tryable — no approval)
 *  - the per-tenant install state machine
 *  - the admin create/update payload schema
 *
 * Kept intentionally free of DB/request dependencies so the whole decision
 * surface is unit-testable (tests/core/m15-system-catalog.test.ts).
 */

/** Real systems = registered in-shell modules under /app/<slug>. */
export const REAL_SYSTEM_ROUTES: Record<string, string> = {
  grocery: "/app/grocery",
  "sama-center": "/app/sama-center",
};

export const REAL_SYSTEM_SLUGS: readonly string[] = Object.keys(REAL_SYSTEM_ROUTES);

/** Demo systems = live same-origin proxied standalone apps (try instantly). */
export const SEEDABLE_DEMO_SLUGS: readonly string[] = [
  "pos",
  "dental",
  "hospital",
  "pharmacy",
  "laboratory",
  "optometry",
  "cafe",
];

export type SystemKind = "real" | "demo" | "none";

/**
 * `preparing` is `installed` with a build still outstanding.
 *
 * An org's own copy of a system is a folder of source, not a running app: the
 * first open has to build it, which takes minutes. Telling the customer
 * "installed" and then leaving them on a blank page for two minutes is the
 * failure this state exists to prevent, so the card says what is actually true —
 * their copy exists and is being made ready — and the marketplace polls until it
 * is.
 */
export type InstallState =
  | "unavailable"
  | "installed"
  | "preparing"
  | "pending"
  | "demo"
  | "installable"
  | "soon";

export interface SystemOpenRoute {
  slug: string;
  route: string | null;
  kind: SystemKind;
}

/** Where the user actually lands when opening a system card. */
export function openRouteForSlug(slug: string): string | null {
  return REAL_SYSTEM_ROUTES[slug] ?? liveHref(slug) ?? null;
}

/**
 * Where a system card leads a *specific* organization.
 *
 * A real system is not a page on the platform, it is that org's own copy of a
 * codebase, running in its own process and mounted at `/{org}/{system}` — which
 * is the path its links and asset URLs are compiled against. Leading it to
 * `/app/<system>` instead made the child serve redirects for every asset it
 * asked for.
 *
 * Demo systems are the platform's own apps, so they stay where they are. When no
 * organization is known the org-less route is returned: `/app/<system>` still
 * resolves through the session, and guessing an org would be worse than saying
 * nothing about one.
 */
export function openRouteForOrgSlug(slug: string, orgSlug: string | null | undefined): string | null {
  if (slug in REAL_SYSTEM_ROUTES) {
    return orgSlug ? orgSystemPath(orgSlug, slug) : REAL_SYSTEM_ROUTES[slug];
  }
  return openRouteForSlug(slug);
}

export function systemKind(slug: string): SystemKind {
  if (slug in REAL_SYSTEM_ROUTES) return "real";
  return liveHref(slug) ? "demo" : "none";
}

export function isDemoSystem(slug: string): boolean {
  return systemKind(slug) === "demo";
}

export function openRouteForSystem(slug: string): SystemOpenRoute {
  return { slug, route: openRouteForSlug(slug), kind: systemKind(slug) };
}

/**
 * Per-tenant install state machine.
 *  - unavailable: app globally deactivated by the platform.
 *  - installed:   tenant already has it (open it).
 *  - soon:        catalog lists the system but it is not built yet. NOT the
 *                 same as "unavailable": a coming-soon card is a promise, while
 *                 unavailable means the platform switched it off. Checked after
 *                 `installed` so a tenant that already has the system still gets
 *                 the "open" affordance.
 *  - pending:     a real setup request is awaiting platform approval.
 *  - demo:        demo system — instant, no approval, opens the demo route.
 *  - installable: real system, not yet installed — the card offers "setup"
 *                 which ALWAYS creates an approval request (pending).
 */
export function installState(input: {
  appIsActive: boolean;
  installed?: boolean;
  hasPendingRequest?: boolean;
  isDemo?: boolean;
  /** From the curated catalog: listed but not yet available. */
  soon?: boolean;
  /** Installed, but the org's own copy has not been built yet. */
  needsBuild?: boolean;
}): InstallState {
  if (!input.appIsActive) return "unavailable";
  // `preparing` is checked before `installed` because it *is* installed — it
  // just is not runnable yet, and the card must not offer "Open" for a folder
  // with no build in it.
  if (input.installed) return input.needsBuild ? "preparing" : "installed";
  if (input.soon) return "soon";
  if (input.hasPendingRequest) return "pending";
  if (input.isDemo) return "demo";
  return "installable";
}

/**
 * Which marketplace cards may offer "install" at all.
 *
 * A card is installable only when BOTH halves exist, and each half is a
 * different failure the customer would otherwise hit:
 *  - an active row in the `app` catalog, else the request API answers 404;
 *  - a source directory under `system/`, else the approved system answers 404
 *    at `/{org}/{system}` and the approval bought a dead link.
 *
 * The curated card list and the deployment's sources drift apart constantly —
 * the catalog carries 197 rows while `system/` holds one — so this gate is the
 * single place that decides which promises the product can actually keep. Pure,
 * so both halves are passed in and the whole decision is testable without a DB
 * or a filesystem.
 *
 * Card order is preserved: the caller renders in catalog order and the set is
 * only ever used for membership tests and iteration in that order.
 */
export function installableCardIds(input: {
  cardIds: readonly string[];
  /** Slugs with an `app` row the platform has not switched off. */
  activeSlugs: readonly string[];
  /** System slugs that have a servable source, i.e. `listSystemSources()`. */
  sourceSlugs: readonly string[];
}): Set<string> {
  const active = new Set(input.activeSlugs);
  const sourced = new Set(input.sourceSlugs);
  return new Set(input.cardIds.filter((id) => active.has(id) && sourced.has(id)));
}

/** Admin create/update payload for a catalog entry (unknown keys stripped). */
export const catalogAppSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "slug must be lowercase kebab-case"),
  name: z.string().trim().min(1).max(120),
  nameAr: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(1000),
  descriptionAr: z.string().trim().min(1).max(1000),
  icon: z.string().trim().min(1).max(64),
  category: z.string().trim().min(1).max(64),
  version: z.string().trim().min(1).max(32),
  routePrefix: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .refine((v) => v.startsWith("/"), "routePrefix must start with /"),
  isActive: z.boolean().optional(),
  status: z.enum(["active", "in-maintenance", "deprecated"]).optional(),
  image: z.string().trim().max(512).optional(),
  schemaKey: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9_]+$/, "schemaKey must be lowercase alphanumeric/underscore")
    .optional(),
});

export type CatalogAppInput = z.infer<typeof catalogAppSchema>;

/** Curated bilingual metadata used to seed the demo systems into the catalog. */
export interface CatalogSeedMeta {
  slug: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  icon: string;
  category: string;
  version: string;
  routePrefix: string;
}

export const DEMO_CATALOG_META: readonly CatalogSeedMeta[] = [
  {
    slug: "pos",
    name: "POS System",
    nameAr: "نظام نقاط البيع",
    description: "Fast POS with barcode, warehouses, sales and cash register.",
    descriptionAr: "نقاط بيع سريعة مع الباركود والمخازن والمبيعات والصندوق.",
    icon: "store",
    category: "retail",
    version: "1.0.0-demo",
    routePrefix: "/pos",
  },
  {
    slug: "dental",
    name: "Dental Clinic System",
    nameAr: "نظام عيادة الأسنان",
    description: "Patients, fillings, labs and billing for dental clinics.",
    descriptionAr: "إدارة المرضى والحشوات والتركيبات والمختبر وفواتير العيادات.",
    icon: "smile",
    category: "health",
    version: "1.0.0-demo",
    routePrefix: "/dental",
  },
  {
    slug: "hospital",
    name: "Hospital Management System",
    nameAr: "نظام إدارة المستشفيات",
    description: "Patients, departments, beds, appointments and operations.",
    descriptionAr: "إدارة المرضى والأقسام والأسرّة والمواعيد والعمليات.",
    icon: "hospital",
    category: "health",
    version: "1.0.0-demo",
    routePrefix: "/hospital",
  },
  {
    slug: "pharmacy",
    name: "Pharmacy Management System",
    nameAr: "نظام إدارة الصيدليات",
    description: "Drug inventory, prescriptions, products and pharmacy billing.",
    descriptionAr: "المخزون الدوائي والوصفات والمنتجات وفواتير الصيدلية.",
    icon: "pill",
    category: "health",
    version: "1.0.0-demo",
    routePrefix: "/pharmacy",
  },
  {
    slug: "laboratory",
    name: "Laboratory Management System",
    nameAr: "نظام إدارة المختبر",
    description: "Tests, samples, results and lab departments management.",
    descriptionAr: "إدارة الفحوصات والعينات والنتائج والأقسام في المختبر.",
    icon: "microscope",
    category: "health",
    version: "1.0.0-demo",
    routePrefix: "/laboratory",
  },
  {
    slug: "optometry",
    name: "Optometry Clinic System",
    nameAr: "نظام عيادة العيون",
    description: "Patients, eye exams, glasses and lens prescriptions.",
    descriptionAr: "إدارة المرضى والفحوصات البصرية ووصفات النظارات والعدسات.",
    icon: "eye",
    category: "health",
    version: "1.0.0-demo",
    routePrefix: "/optometry",
  },
  {
    slug: "cafe",
    name: "Café Management System",
    nameAr: "نظام إدارة المقاهي",
    description: "Tables, menu, orders and staff management for cafés.",
    descriptionAr: "إدارة الطاولات والقائمة والطلبات والموظفين للمقاهي.",
    icon: "coffee",
    category: "food",
    version: "1.0.0-demo",
    routePrefix: "/celia",
  },
];
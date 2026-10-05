/**
 * Demo systems registry — the dedicated structure (demo-systems/) index.
 *
 * Every standalone demo system lives in its own folder/port and is reverse-
 * proxied same-origin by the platform (see next.config.ts `rewrites`). This
 * module is the single machine-readable source about them; the human-readable
 * structure lives in demo-systems/README.md.
 *
 * Marketplace classification: systems here (demo kind) open instantly with
 * NO platform approval, unlike the real systems (grocery, sama-center) which
 * always enter the approval queue first.
 */

export interface DemoSystem {
  /** Catalog slug used by the marketplace (kitchen paths + this registry). */
  slug: string;
  /** Reverse-proxy target port configured via next.config.ts rewrites. */
  port: number;
  /** Env var name in .env that overrides the target URL. */
  envVar: string;
  /** Folder inside the repo that holds the standalone build/dev app. */
  sourceDir: string;
  /** Where in `npm run dev` the app is started. */
  devScript: string;
  stack: string;
  status: "live" | "dev" | "standalone";
  nameAr: string;
  nameEn: string;
  /**
   * Routing key under which the live demo is served on this platform. Derived
   * from `sourceDir` by `mountPath`; never written by hand, because it must stay
   * in step with the sub-app's own `basePath`.
   */
  rootPath: string;
}

/** Where in the repo the sub-app projects live. */
const DEMO_SUBDIR = "demo-systems/";
/** Public URL namespace for apps under DEMO_SUBDIR. */
const DEMO_NAMESPACE = "/demo";

/**
 * The public mount point for a system, derived from where its source lives.
 *
 * Apps built inside this repo (`demo-systems/<slug>`) are served under the
 * `/demo` namespace, so the demo section of the site owns its own subtree
 * instead of scattering top-level slugs. Apps that are separate deployables
 * vendored under `public/` keep their own root-level mount.
 *
 * Deriving this rather than hand-writing it is what keeps the platform rewrite,
 * the links on `/demo`, and each sub-app's `basePath` from drifting apart: a
 * sub-app serves itself at whatever `basePath` it is built with, so a
 * hand-written `rootPath` that disagreed would 404 the moment the app is
 * navigated. `tests/demo-mount-paths.test.ts` asserts the table agrees.
 */
export function mountPath(sourceDir: string, slug: string): string {
  return sourceDir.startsWith(DEMO_SUBDIR) ? `${DEMO_NAMESPACE}/${slug}` : `/${slug}`;
}

const system = (
  s: Omit<DemoSystem, "rootPath">,
): DemoSystem => ({ ...s, rootPath: mountPath(s.sourceDir, s.slug) });

/** Single source of truth for the proxied demo systems. */
export const DEMO_SYSTEMS: readonly DemoSystem[] = [
  system({
    slug: "grocery",
    port: 3101,
    envVar: "GROCERY_URL",
    sourceDir: "demo-systems/grocery",
    devScript: "dev:grocery",
    stack: "Next.js standalone",
    status: "live",
    nameAr: "نظام البقالة",
    nameEn: "Grocery Store",
  }),
  system({
    slug: "sama",
    port: 3102,
    envVar: "SAMA_WEB_URL",
    sourceDir: "public/samaSYSTEM-main",
    devScript: "dev:sama",
    stack: "Vite SPA + Express API",
    status: "live",
    nameAr: "مركز سما الطبي",
    nameEn: "Sama Medical Center",
  }),
  system({
    slug: "cafe",
    port: 3104,
    envVar: "CELIA_URL",
    sourceDir: "public/celia-main",
    devScript: "dev:celia",
    stack: "Next.js standalone",
    status: "live",
    nameAr: "نظام المقاهي (سيليا)",
    nameEn: "Café System (Celia)",
  }),
  system({
    slug: "hospital",
    port: 3105,
    envVar: "HOSPITAL_URL",
    sourceDir: "public/Hospital--main",
    devScript: "-",
    stack: "Next.js standalone",
    status: "dev",
    nameAr: "نظام إدارة المستشفيات",
    nameEn: "Hospital Management",
  }),
  system({
    slug: "dental",
    port: 3106,
    envVar: "DENTAL_URL",
    sourceDir: "demo-systems/dental",
    devScript: "dev:dental",
    stack: "Next.js standalone",
    status: "live",
    nameAr: "نظام عيادة الأسنان",
    nameEn: "Dental Clinic",
  }),
  system({
    slug: "laboratory",
    port: 3107,
    envVar: "LAB_URL",
    sourceDir: "public/laboratory--main",
    devScript: "-",
    stack: "Next.js standalone",
    status: "live",
    nameAr: "نظام المختبر",
    nameEn: "Laboratory System",
  }),
  system({
    slug: "pharmacy",
    port: 5000,
    envVar: "PHARMACY_URL",
    sourceDir: "public/pharmacy",
    devScript: "dev:pharmacy",
    stack: "Next.js standalone",
    status: "live",
    nameAr: "نظام الصيدلية",
    nameEn: "Pharmacy System",
  }),
  system({
    slug: "pos",
    port: 3108,
    envVar: "POS_URL",
    sourceDir: "public/POS System",
    devScript: "dev:pos",
    stack: "Next.js standalone",
    status: "live",
    nameAr: "نظام نقاط البيع",
    nameEn: "POS System",
  }),
  system({
    slug: "optometry",
    port: 3109,
    envVar: "OPTOM_URL",
    sourceDir: "public/Optometry  Eye Clinic System",
    devScript: "dev:optometry",
    stack: "Next.js standalone",
    status: "live",
    nameAr: "نظام عيادة العيون",
    nameEn: "Optometry Clinic",
  }),
];

/** Systems served under the `/demo` namespace, in registry order. */
export const DEMO_NAMESPACE_SYSTEMS: readonly DemoSystem[] = DEMO_SYSTEMS.filter((s) =>
  s.rootPath.startsWith(`${DEMO_NAMESPACE}/`),
);

const SYSTEMS_INDEX = new Map(DEMO_SYSTEMS.map((s) => [s.slug, s]));
const ROUTE_INDEX = new Map(DEMO_SYSTEMS.map((s) => [s.rootPath, s]));

export function getDemoSystem(slug: string): DemoSystem | undefined {
  return SYSTEMS_INDEX.get(slug);
}

export function getDemoSystemByRootPath(rootPath: string): DemoSystem | undefined {
  return ROUTE_INDEX.get(rootPath);
}
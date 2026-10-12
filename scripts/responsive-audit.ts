/**
 * Responsive audit: loads each route at a set of mobile/tablet/desktop
 * widths and measures what the browser actually did with it, rather than
 * what the CSS says it should do.
 *
 * Reported per (route, width):
 *   - the viewport meta the document shipped with
 *   - window.innerWidth (what the renderer used) vs the width requested
 *   - document scrollWidth vs clientWidth, i.e. is there horizontal overflow
 *   - the specific elements that stick out past the right/left edge
 *   - html/body computed font-size, transform and zoom (a scaled-down body
 *     is what "everything is tiny" looks like from the inside)
 *
 * Usage:
 *   npx tsx scripts/responsive-audit.ts <baseUrl> [widthsCsv] [routesCsv]
 *   PROBE_BROWSER="C:\\...\\msedge.exe" to override the browser binary.
 */
import puppeteer, { type Page } from "puppeteer-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const base = (process.argv[2] ?? "http://127.0.0.1:3100").replace(/\/+$/, "");
const widths = (process.argv[3] ?? "360,768,1280")
  .split(",")
  .map((w) => Number(w.trim()))
  .filter((w) => Number.isFinite(w) && w > 0);

const DEFAULT_ROUTES = [
  "/",
  "/signin",
  "/signup",
  "/apps",
  "/systems",
  "/demo",
  "/select-org",
  "/app",
  "/app/products",
  "/app/sales",
  "/app/reports",
  "/app/pos",
  "/platform-admin/tenants",
  "/profile",
];
const routes = process.argv[4] ? process.argv[4].split(",").map((r) => r.trim()) : DEFAULT_ROUTES;

const EDGE =
  process.env.PROBE_BROWSER ??
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

/** Screenshots + report land under `.data/`, which is already gitignored. */
const OUT = process.env.AUDIT_OUT ?? join(process.cwd(), ".data", "responsive-audit");

/** Reads everything about the current document that a "why does it look
 *  broken" question needs. Runs in the page, so no Node types inside. */
function probe() {
  const doc = document.documentElement;
  const body = document.body;
  const de = document.defaultView;
  const innerWidth = de?.innerWidth ?? 0;
  const meta = document.querySelector('meta[name="viewport"]');

  const cs = (el: Element) => (el ? de!.getComputedStyle(el) : null);
  const bodyCs = cs(body);
  const docCs = cs(doc);

  const ident = (el: Element) => {
    const t = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : "";
    const cl = (el.className && typeof el.className === "string" ? el.className : "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 3)
      .map((c) => `.${c}`)
      .join("");
    return `${t}${id}${cl}`;
  };

  // Every element that paints, with the geometry and computed sizing that
  // would force it wider than the viewport. `min-width` in particular: a
  // fixed desktop width is the usual reason a mobile layout viewport ends up
  // wider than the device, which is what shrinks the whole page.
  interface Rec {
    sel: string;
    l: number;
    r: number;
    w: number;
    pos: string;
    minW: string;
    cssW: string;
    sw: number;
    cw: number;
  }
  const recs: Rec[] = [];
  const all = body ? Array.from(body.querySelectorAll<HTMLElement>("*")) : [];
  for (const el of all) {
    const b = el.getBoundingClientRect();
    if (b.width === 0 && b.height === 0) continue;
    const c = de!.getComputedStyle(el);
    recs.push({
      sel: ident(el),
      l: Math.round(b.left),
      r: Math.round(b.right),
      w: Math.round(b.width),
      pos: c.position,
      minW: c.minWidth,
      cssW: c.width,
      sw: el.scrollWidth,
      cw: el.clientWidth,
    });
  }
  const spill = (x: Rec) => Math.max(x.r - doc.clientWidth, -x.l);
  const bySpill = [...recs].sort((a, b) => spill(b) - spill(a)).slice(0, 8);
  const byWidth = [...recs].sort((a, b) => b.w - a.w).slice(0, 8);
  const forcedMin = recs.filter((x) => x.minW.endsWith("px") && parseFloat(x.minW) > doc.clientWidth).slice(0, 8);
  const selfOverflow = recs.filter((x) => x.sw - x.cw > 2).slice(0, 8);

  // First block-level landmark, to answer "is the layout shifted sideways".
  const anchor =
    (body?.querySelector("main") as HTMLElement | null) ??
    (body?.querySelector("header") as HTMLElement | null) ??
    body;
  const anchorRect = anchor?.getBoundingClientRect();

  return {
    metaViewport: meta?.getAttribute("content") ?? null,
    innerWidth,
    clientWidth: doc.clientWidth,
    scrollWidth: doc.scrollWidth,
    bodyScrollWidth: body?.scrollWidth ?? 0,
    horizontalOverflow: doc.scrollWidth - doc.clientWidth,
    htmlFont: docCs?.fontSize ?? "",
    bodyFont: bodyCs?.fontSize ?? "",
    bodyTransform: bodyCs && bodyCs.transform !== "none" ? bodyCs.transform : "",
    bodyZoom: bodyCs && bodyCs.zoom !== "1" && bodyCs.zoom !== "auto" ? bodyCs.zoom : "",
    docZoom: docCs && docCs.zoom !== "1" && docCs.zoom !== "auto" ? docCs.zoom : "",
    anchor: anchor ? ident(anchor) : "",
    anchorRect: anchorRect
      ? { left: Math.round(anchorRect.left), right: Math.round(anchorRect.right), width: Math.round(anchorRect.width) }
      : null,
    bySpill,
    byWidth,
    forcedMin,
    selfOverflow,
    // A page that reached the document but lost its stylesheet is the failure
    // mode behind "everything is tiny": zero rules means the logo below is
    // unconstrained and inflates the layout viewport.
    styleSheetCount: document.styleSheets.length,
    elCount: all.length,
  };
}

type Probe = ReturnType<typeof probe>;

/**
 * tsx's `keepNames` transform wraps every named function in `__name(...)` —
 * including the helpers nested inside `probe()` — and puppeteer serializes
 * that source into the page, where the helper does not exist. Installing a
 * no-op in the page makes the round trip survivable. It has to be re-installed
 * after every navigation, because each one gets a fresh window.
 */
const installNameHelper = (page: Page) =>
  page.evaluate(() => {
    (globalThis as unknown as { __name: <T>(fn: T) => T }).__name = (fn) => fn;
  });

/** Fresh blank so a route that failed before evaluating still reports. */
function blankProbe(): Probe {
  return {
    metaViewport: null, innerWidth: 0, clientWidth: 0, scrollWidth: 0, bodyScrollWidth: 0,
    horizontalOverflow: 0, htmlFont: "", bodyFont: "", bodyTransform: "", bodyZoom: "",
    docZoom: "", anchor: "", anchorRect: null, bySpill: [], byWidth: [], forcedMin: [],
    selfOverflow: [], styleSheetCount: -1, elCount: 0,
  };
}

interface Result {
  route: string;
  width: number;
  status: number;
  title: string;
  /** Where the navigation actually landed — a redirect to /signin would
   *  otherwise make a broken page look clean. */
  finalUrl: string;
  probe: Probe;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars"],
  });

  // Sign in once and keep the session on the single page object, so the
  // authenticated routes are measured as the real user sees them.
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  await installNameHelper(page);
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(`${base}/signin`, { waitUntil: "domcontentloaded" });
  const signedIn = await page
    .evaluate(
      async (baseUrl, em, pw) => {
        const r = await fetch(`${baseUrl}/api/v1/public/signin`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ identifier: em, password: pw }),
          credentials: "include",
        });
        if (!r.ok) return `signin ${r.status}`;
        const me = await (await fetch(`${baseUrl}/api/v1/me`, { credentials: "include" })).json();
        const orgs = me?.data?.organizations ?? [];
        if (!orgs.length) return "no organizations";
        if (!me.data.activeTenant) {
          const a = await fetch(`${baseUrl}/api/v1/organizations/active`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ organizationId: orgs[0].id }),
            credentials: "include",
          });
          if (!a.ok) return `activate ${a.status}`;
        }
        return "ok";
      },
      base,
      process.argv[5] ?? "perfowner@bos.local",
      process.argv[6] ?? "PerfProbe12345!",
    )
    .catch((e: Error) => `error ${e.message}`);
  console.log(`auth: ${signedIn}`);
  console.log(`base: ${base}`);
  console.log(`out : ${OUT}\n`);

  const results: Result[] = [];
  for (const route of routes) {
    for (const width of widths) {
      let status = 0;
      let title = "";
      let measured = blankProbe();
      try {
        await page.setViewport({ width, height: 844, isMobile: width < 768, hasTouch: width < 768 });
        const resp = await page.goto(base + route, { waitUntil: "domcontentloaded" });
        status = resp?.status() ?? 0;
        await installNameHelper(page);
        // Wait for every image before measuring. An unconstrained logo only
        // reaches its natural width once it decodes, so measuring early hides
        // exactly the overflow this exists to catch.
        await page.evaluate(async () => {
          await Promise.all(
            Array.from(document.images).map((im) =>
              im.complete
                ? Promise.resolve()
                : new Promise<void>((res) => {
                    im.addEventListener("load", () => res(), { once: true });
                    im.addEventListener("error", () => res(), { once: true });
                    setTimeout(res, 5000);
                  }),
            ),
          );
        });
        // Let hydration settle; layout bugs from client JS only appear after it.
        await new Promise((r) => setTimeout(r, 1200));
        title = await page.title();
        measured = await page.evaluate(probe);
        const shot = `${OUT}\\${route.replace(/[^\w]+/g, "_").replace(/^_|_$/g, "") || "root"}-${width}.png`;
        await page.screenshot({ path: shot, fullPage: false });
      } catch (e) {
        status = -1;
        title = `ERROR ${(e as Error).message}`;
        console.log(`      !! ${route}@${width}: ${title}`);
      }
      results.push({ route, width, status, title, finalUrl: page.url().replace(base, ""), probe: measured });
      const p = measured;
      const flags: string[] = [];
      if (!p.metaViewport) flags.push("NO-VIEWPORT");
      if (p.innerWidth && p.innerWidth !== width) flags.push(`SCALED(${p.innerWidth})`);
      if (p.horizontalOverflow > 0) flags.push(`OVERFLOW-x${p.horizontalOverflow}`);
      if (p.bodyTransform) flags.push(`BODY-TRANSFORM ${p.bodyTransform}`);
      if (p.bodyZoom) flags.push(`BODY-ZOOM ${p.bodyZoom}`);
      if (p.docZoom) flags.push(`HTML-ZOOM ${p.docZoom}`);
      if (p.anchorRect && (p.anchorRect.left > width * 0.5 || p.anchorRect.right < width * 0.5))
        flags.push(`ANCHOR-SHIFT l=${p.anchorRect.left} r=${p.anchorRect.right}`);
      const o = p.bySpill[0];
      if (o) flags.push(`WORST ${o.sel}@${o.l}..${o.r}`);
      const f = p.forcedMin[0];
      if (f) flags.push(`MIN-W ${f.sel}=${f.minW}`);
      console.log(
        `${String(width).padStart(4)}  ${String(status).padStart(3)}  ${route.padEnd(30)} ${flags.join("  ") || "ok"}` +
          (p.styleSheetCount === 0 ? "  ** NO STYLESHEETS LOADED **" : "") +
          (page.url().replace(base, "") !== route ? `  -> ${page.url().replace(base, "")}` : ""),
      );
    }
  }

  writeFileSync(join(OUT, "report.json"), JSON.stringify({ base, results }, null, 2));
  console.log(`\nwrote ${join(OUT, "report.json")}`);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


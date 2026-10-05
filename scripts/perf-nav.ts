/**
 * Click-through navigation probe.
 *
 * Loads the tenant shell once, then clicks each sidebar link in turn and
 * measures what the user actually experiences: how long the click takes to
 * produce the new page, and how many requests that click caused. This is the
 * metric the prefetch and RSC work is supposed to move — a cold `page.goto`
 * per route does not show it.
 *
 * Usage: npx tsx scripts/perf-nav.ts <baseUrl> [email] [password]
 */
import puppeteer from "puppeteer-core";

const base = process.argv[2] ?? "http://localhost:3100";
const email = process.argv[3] ?? "perfowner@bos.local";
const password = process.argv[4] ?? "PerfProbe12345!";

const EDGE =
  process.env.PROBE_BROWSER ??
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

/** Sidebar href -> label, in the order they appear. */
const LINKS: Array<[string, string]> = [
  ["/app", "dashboard"],
  ["/app/sales", "sales"],
  ["/app/products", "products"],
  ["/app/inventory", "inventory"],
  ["/app/customers", "customers"],
  ["/app/suppliers", "suppliers"],
  ["/app/purchases", "purchases"],
  ["/app/expenses", "expenses"],
  ["/app/finance", "finance"],
  ["/app/reports", "reports"],
  ["/app/workflows", "workflows"],
  ["/app/audit", "audit"],
];

async function main() {
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.setDefaultTimeout(30000);

  await page.goto(`${base}/signin`, { waitUntil: "networkidle2" });
  await page.evaluate(
    async (baseUrl, em, pw) => {
      const r = await fetch(`${baseUrl}/api/v1/public/signin`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier: em, password: pw }),
        credentials: "include",
      });
      if (!r.ok) throw new Error(String(r.status));
      const me = await (await fetch(`${baseUrl}/api/v1/me`, { credentials: "include" })).json();
      const orgs = me?.data?.organizations ?? [];
      if (!orgs.length) throw new Error("probe user has no organizations");
      if (!me.data.activeTenant) {
        const a = await fetch(`${baseUrl}/api/v1/organizations/active`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ organizationId: orgs[0].id }),
          credentials: "include",
        });
        if (!a.ok) throw new Error(`activate ${a.status}`);
      }
    },
    base,
    email,
    password,
  );

  // Enter the shell once; everything after this is client-side navigation.
  await page.goto(`${base}/app`, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 1500));

  // EAGER_PREFETCH=1 reproduces the previous policy — every visible link
  // prefetched on entering the viewport — so the prefetch change can be
  // compared on this same build.
  if (process.env.EAGER_PREFETCH === "1") {
    const t = Date.now();
    const urls: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("_rsc=")) urls.push(r.url());
    });
    for (const [href] of LINKS) {
      await page.evaluate((h) => {
        const el = document.querySelector<HTMLAnchorElement>(`a[href="${h}"]`);
        el?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      }, href);
    }
    await new Promise((r) => setTimeout(r, 4000));
    console.log(
      `eager prefetch of ${LINKS.length} links issued ${urls.length} _rsc requests in ${Date.now() - t}ms`,
    );
  }

  const rows: Array<{ route: string; clickToContentMs: number; reqs: number; apiReqs: number }> = [];

  for (const [href, name] of LINKS) {
    const reqs: string[] = [];
    const onReq = (r: import("puppeteer-core").HTTPRequest) => reqs.push(r.url());
    page.on("request", onReq);

    const t0 = Date.now();
    // Click the real sidebar link so hover-prefetch and client routing both run.
    const clicked = await page.evaluate((h) => {
      const el = document.querySelector<HTMLAnchorElement>(`a[href="${h}"]`);
      if (!el) return false;
      el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      el.click();
      return true;
    }, href);

    if (!clicked) {
      page.off("request", onReq);
      console.error(`link not found: ${href}`);
      continue;
    }

    // "Content" = the new route has rendered. Wait for the URL to settle and
    // for the main region to stop being the previous page's skeleton.
    await page
      .waitForFunction((h) => location.pathname === h, { timeout: 30000 }, href)
      .catch(() => undefined);
    await page
      .waitForFunction(
        () => {
          const m = document.querySelector("main");
          return !!m && !m.querySelector('[aria-busy="true"]') && m.textContent!.trim().length > 40;
        },
        { timeout: 30000 },
      )
      .catch(() => undefined);
    const ms = Date.now() - t0;
    await new Promise((r) => setTimeout(r, 250));
    page.off("request", onReq);

    const api = reqs.filter((u) => u.includes("/api/"));
    rows.push({ route: name, clickToContentMs: ms, reqs: reqs.length, apiReqs: api.length });
  }

  console.table(rows);
  const n = rows.length || 1;
  const avgClick = Math.round(rows.reduce((a, r) => a + r.clickToContentMs, 0) / n);
  const avgReqs = Math.round(rows.reduce((a, r) => a + r.reqs, 0) / n);
  const avgApi = Math.round(rows.reduce((a, r) => a + r.apiReqs, 0) / n);
  const worst = rows.reduce((a, r) => (r.clickToContentMs > a.clickToContentMs ? r : a), rows[0]);
  console.log(`avg click-to-content=${avgClick}ms  avg reqs/click=${avgReqs}  avg api/click=${avgApi}`);
  console.log(`worst: ${worst?.route} ${worst?.clickToContentMs}ms`);
  console.log(
    "NAV_JSON " +
      JSON.stringify({
        rows,
        avgClickToContentMs: avgClick,
        avgRequestsPerClick: avgReqs,
        avgApiRequestsPerClick: avgApi,
        worstRoute: worst?.route,
        worstClickToContentMs: worst?.clickToContentMs,
        totalRequests: rows.reduce((a, r) => a + r.reqs, 0),
      }),
  );

  await browser.close();
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);

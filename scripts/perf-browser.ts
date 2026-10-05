/**
 * Browser-side probe: signs in, then loads each route as a real page load and
 * records the full network waterfall (total requests, XHR/fetch count,
 * transferred bytes, DOMContentLoaded, Load). This is what a user actually
 * experiences — the server HTML alone hides the client-fetch waterfall that
 * every one of these pages currently pays after hydration.
 *
 * Usage: npx tsx scripts/perf-browser.ts <baseUrl> <email> <password>
 */
import puppeteer from "puppeteer-core";

const base = process.argv[2] ?? "http://localhost:3100";
const email = process.argv[3] ?? "perfowner@bos.local";
const password = process.argv[4] ?? "PerfProbe12345!";

const EDGE =
  process.env.PROBE_BROWSER ??
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

const ROUTES = [
  "/app",
  "/app/products",
  "/app/customers",
  "/app/sales",
  "/app/inventory",
  "/app/reports",
  "/app/finance",
  "/app/expenses",
  "/app/suppliers",
  "/app/purchases",
  "/app/workflows",
  "/app/audit",
];

interface Row {
  route: string;
  status: number;
  reqs: number;
  xhr: number;
  jsKB: number;
  allKB: number;
  dcl: number;
  load: number;
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.setDefaultTimeout(60000);

  // Warm the origin + service worker so the numbers are steady-state.
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
      // The session row needs an active org or every /app route 307s to
      // /select-org and the whole measurement silently measures the wrong page.
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
        if (!a.ok) throw new Error(`activate ${a.status} ${await a.text()}`);
      }
    },
    base,
    email,
    password,
  );

  const rows: Row[] = [];
  for (const route of ROUTES) {
    const seen: Array<{ url: string; bytes: number; type: string }> = [];
    let inFlight = 0;
    const onResp = (r: import("puppeteer-core").HTTPResponse) => {
      const type = r.request().resourceType();
      inFlight++;
      void (async () => {
        try {
          // encodedDataLength covers redirects and streamed bodies, which
          // response.buffer() refuses for. buffer() can also hang forever on
          // an aborted response, so a timeout race keeps the drain bounded.
          let bytes = 0;
          try {
            const h = r.headers()["content-length"];
            if (h) {
              bytes = Number(h);
            } else {
              bytes = await Promise.race([
                r.buffer().then((b) => b.length),
                new Promise<number>((resolve) => setTimeout(() => resolve(-1), 3000)),
              ]);
              if (bytes < 0) bytes = 0;
            }
          } catch {
            bytes = 0;
          }
          seen.push({ url: r.url(), bytes, type });
        } finally {
          inFlight--;
        }
      })();
    };
    // Register the exact same function reference that is later detached,
    // otherwise listeners accumulate for every route and skew later rows.
    page.on("response", onResp);
    const t0 = Date.now();
    const nav = await page.goto(base + route, { waitUntil: "networkidle2" });
    await new Promise((r) => setTimeout(r, 500));
    const load = Date.now() - t0;
    page.off("response", onResp);
    // Let in-flight body reads finish before snapshotting, but never block
    // the whole run on a response that will not resolve.
    const drainUntil = Date.now() + 4000;
    while (inFlight > 0 && Date.now() < drainUntil) {
      await new Promise((r) => setTimeout(r, 25));
    }

    const metrics = await page.evaluate(() => {
      const n = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      return {
        dcl: Math.round(n?.domContentLoadedEventEnd ?? 0),
        load: Math.round(n?.loadEventEnd ?? 0),
      };
    });

    const api = seen.filter((s) => s.url.includes("/api/"));
    rows.push({
      route,
      status: nav?.status() ?? 0,
      reqs: seen.length,
      xhr: api.length,
      jsKB: Math.round(seen.filter((s) => s.type === "script").reduce((a, s) => a + s.bytes, 0) / 1024),
      allKB: Math.round(seen.reduce((a, s) => a + s.bytes, 0) / 1024),
      dcl: metrics.dcl,
      load: Math.max(metrics.load, load),
    });
  }

  console.table(rows);
  const ok = rows.filter((r) => r.status === 200);
  if (ok.length !== rows.length) {
    console.error(`WARNING: only ${ok.length}/${rows.length} routes returned 200 — numbers below are suspect`);
  }
  const avg = (f: keyof Row) =>
    ok.length ? Math.round(ok.reduce((a, r) => a + Number(r[f]), 0) / ok.length) : 0;
  const totalReqs = ok.reduce((a, r) => a + r.reqs, 0);
  const totalXhr = ok.reduce((a, r) => a + r.xhr, 0);
  console.log(
    `avg reqs=${avg("reqs")}  avg api=${avg("xhr")}  avg js=${avg("jsKB")}KB  avg dcl=${avg("dcl")}ms`,
  );
  console.log(
    "BROWSER_JSON " +
      JSON.stringify({
        routesOk: ok.length,
        routesTotal: rows.length,
        rows,
        avgRequests: avg("reqs"),
        avgApiRequests: avg("xhr"),
        avgJsKB: avg("jsKB"),
        avgDcl: avg("dcl"),
        avgLoad: avg("load"),
        totalRequests: totalReqs,
        totalApiRequests: totalXhr,
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

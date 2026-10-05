/**
 * Baseline/after HTTP probe for the authenticated tenant app.
 *
 * Signs in, activates the probe org, then measures page + API routes
 * (1 warm-up + 3 timed runs, median reported).
 *
 * Usage: npx tsx scripts/perf-probe.ts <baseUrl> <email> <password>
 */
const base = process.argv[2] ?? "http://localhost:3100";
const email = process.argv[3] ?? "perfowner@bos.local";
const password = process.argv[4] ?? "PerfProbe12345!";

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

const API_ROUTES = [
  "/api/v1/reports/summary?days=30",
  "/api/v1/me",
  "/api/v1/products?limit=50",
  "/api/v1/customers?limit=50",
  "/api/v1/dashboard",
  "/api/v1/settings",
];

async function main() {
  const jar = new Map();

  function cookieHeader() {
    return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  function storeCookies(res: Response) {
    const raw = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    for (const c of raw) {
      const [pair] = c.split(";");
      const eq = pair.indexOf("=");
      if (eq < 1) continue;
      jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  async function req(path: string, init: RequestInit = {}) {
    const res = await fetch(base + path, {
      ...init,
      headers: { ...(init.headers ?? {}), cookie: cookieHeader() },
      redirect: "manual",
    });
    storeCookies(res);
    return res;
  }

  const signin = await req("/api/v1/public/signin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier: email, password }),
  });
  if (!signin.ok) {
    console.error(`sign-in failed: ${signin.status} ${await signin.text()}`);
    process.exit(1);
  }

  const meRes = await req("/api/v1/me");
  const me = await meRes.json();
  const orgs = me?.data?.organizations ?? [];
  if (!orgs.length) {
    console.error("probe user has no organizations");
    process.exit(1);
  }
  const active = me.data.activeTenant?.organizationId
    ? orgs[0]
    : orgs[0];

  // Make sure the session has an active org — otherwise every /app route
  // redirects to /select-org and the measurement is meaningless.
  if (!me.data.activeTenant) {
    const act = await req("/api/v1/organizations/active", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ organizationId: active.id }),
    });
    if (!act.ok) {
      console.error(`activate failed: ${act.status} ${await act.text()}`);
      process.exit(1);
    }
  }

  interface ProbeRow {
    path: string;
    status: number;
    ttfb: number;
    total: number;
    kb: number;
  }

  async function timeIt(path: string) {
    const t0 = performance.now();
    const res = await req(path, { headers: { accept: "text/html,application/json" } });
    const ttfb = performance.now() - t0;
    const body = await res.text();
    return { status: res.status, ttfb, total: performance.now() - t0, bytes: body.length };
  }

  async function run(label: string, paths: string[]) {
    console.log(`\n=== ${label} -> ${base} ===`);
    const rows: ProbeRow[] = [];
    for (const p of paths) {
      await timeIt(p);
      const runs: Array<{ status: number; ttfb: number; total: number; bytes: number }> = [];
      for (let i = 0; i < 3; i++) runs.push(await timeIt(p));
      runs.sort((a, b) => a.total - b.total);
      const med = runs[1];
      rows.push({
        path: p,
        status: med.status,
        ttfb: Math.round(med.ttfb),
        total: Math.round(med.total),
        kb: Math.round(med.bytes / 1024),
      });
    }
    console.table(rows);
    const ok = rows.filter((r) => r.status === 200);
    const avg = (f: keyof ProbeRow) =>
      ok.length ? Math.round(ok.reduce((a, r) => a + Number(r[f]), 0) / ok.length) : 0;
    console.log(`avg ttfb=${avg("ttfb")}ms  avg total=${avg("total")}ms  ok=${ok.length}/${rows.length}`);
    return rows;
  }

  const pages = await run("PAGES", ROUTES);
  const apis = await run("API", API_ROUTES);

  const ok = pages.filter((r) => r.status === 200);
  const out = {
    base,
    org: active.slug,
    pages,
    apis,
    pageAvgTotal: ok.length ? Math.round(ok.reduce((a, r) => a + r.total, 0) / ok.length) : 0,
    pageAvgTtfb: ok.length ? Math.round(ok.reduce((a, r) => a + r.ttfb, 0) / ok.length) : 0,
  };
  console.log("\nSUMMARY_JSON " + JSON.stringify(out));

}

main().then(
  () => process.exit(0),
  (e) => { console.error(e); process.exit(1); },
);

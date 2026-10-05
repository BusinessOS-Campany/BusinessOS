/**
 * Measures the JavaScript actually shipped to the browser for each route:
 * parses the served HTML, collects every <script src> plus the webpack
 * preloaded chunk hrefs, sums their real on-disk sizes from `.next/static`.
 *
 * Usage: npx tsx scripts/perf-bundle.ts <baseUrl> <email> <password>
 */
import { readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const base = process.argv[2] ?? "http://localhost:3100";
const email = process.argv[3] ?? "perfowner@bos.local";
const password = process.argv[4] ?? "PerfProbe12345!";

const ROUTES = [
  "/",
  "/signin",
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
  "/app/grocery",
  "/app/grocery/products",
  "/app/sama-center",
  "/platform-admin",
];

const STATIC_DIR = join(process.cwd(), ".next", "static");
const sizeCache = new Map<string, number>();
function staticSize(url: string): number {
  if (sizeCache.has(url)) return sizeCache.get(url)!;
  let n = 0;
  if (url.startsWith("/_next/static/")) {
    const p = join(process.cwd(), ".next", url.replace("/_next/", ""));
    if (existsSync(p)) n = statSync(p).size;
  }
  sizeCache.set(url, n);
  return n;
}

const jar = new Map<string, string>();
const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");

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

async function main() {
  const signin = await req("/api/v1/public/signin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier: email, password }),
  });
  if (!signin.ok) throw new Error(`sign-in failed: ${signin.status}`);

  const me = await (await req("/api/v1/me")).json();
  const orgs: Array<{ id: string; slug: string }> = me?.data?.organizations ?? [];
  if (!orgs.length) throw new Error("probe user has no organizations");
  if (!me.data.activeTenant) {
    const act = await req("/api/v1/organizations/active", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ organizationId: orgs[0].id }),
    });
    if (!act.ok) throw new Error(`activate failed: ${act.status} ${await act.text()}`);
  }

  const rows: Array<{ route: string; status: number; html: string; scripts: number; jsKB: number }> = [];
  for (const route of ROUTES) {
    const res = await req(route);
    const html = await res.text();
    const urls = new Set<string>();
    for (const m of html.matchAll(/<script[^>]+src="([^"]+)"/g)) urls.add(m[1]);
    for (const m of html.matchAll(/<link[^>]+rel="preload"[^>]+href="([^"]+\.js[^"]*)"/g)) urls.add(m[1]);
    for (const m of html.matchAll(/<link[^>]+rel="prefetch"[^>]+href="([^"]+\.js[^"]*)"/g)) urls.add(m[1]);
    const js = [...urls].reduce((a, u) => a + staticSize(u), 0);
    rows.push({
      route,
      status: res.status,
      html: String(Math.round(html.length / 1024)),
      scripts: urls.size,
      jsKB: Math.round(js / 1024),
    });
  }

  console.table(rows);
  const ok = rows.filter((r) => r.status === 200);
  const avg = (f: keyof (typeof rows)[number]) =>
    ok.length ? Math.round(ok.reduce((a, r) => a + Number(r[f]), 0) / ok.length) : 0;
  console.log(`avg route JS = ${avg("jsKB")} KB across ${ok.length} routes`);
  console.log("BUNDLE_JSON " + JSON.stringify({ rows, avgRouteJsKB: avg("jsKB") }));
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);

void readFileSync;

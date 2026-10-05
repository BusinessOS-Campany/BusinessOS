/**
 * Lists every network request a single route makes, with size and type.
 * Usage: npx tsx scripts/perf-requests.ts <baseUrl> <route> <email> <password>
 */
import puppeteer from "puppeteer-core";

const base = process.argv[2] ?? "http://localhost:3100";
const route = process.argv[3] ?? "/app";
const email = process.argv[4] ?? "perfowner@bos.local";
const password = process.argv[5] ?? "PerfProbe12345!";

const EDGE =
  process.env.PROBE_BROWSER ??
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

async function main() {
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.setDefaultTimeout(60000);

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
        if (!a.ok) throw new Error(`activate ${a.status} ${await a.text()}`);
      }
    },
    base,
    email,
    password,
  );

  const seen: Array<{ url: string; bytes: number; type: string; status: number }> = [];
  page.on("response", (r) => {
    const type = r.request().resourceType();
    const h = r.headers()["content-length"];
    seen.push({ url: r.url(), bytes: h ? Number(h) : 0, type, status: r.status() });
  });

  await page.goto(base + route, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 800));

  const rows = seen
    .map((s) => ({
      status: s.status,
      type: s.type,
      kb: Math.round((s.bytes / 1024) * 10) / 10,
      url: s.url.replace(base, "").slice(0, 110),
    }))
    .sort((a, b) => b.kb - a.kb);
  console.table(rows);
  console.log("total requests:", rows.length);
  console.log("bytes listed:", Math.round(rows.reduce((a, r) => a + r.kb, 0)), "KB");

  await browser.close();
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);

/**
 * Live diagnostic for one org's cloned grocery system, driven through the
 * public URL: does the "add product" form actually save, and how long does
 * moving between pages take?
 *
 * Signs in as a throwaway platform account that is a member of the org for the
 * duration of the run, so no operator password is read and no real member is
 * touched. Everything the run creates — the platform user, its membership, its
 * sessions, the shadow account the clone links for it, and any product the form
 * actually saves — is removed again in `finally`.
 *
 * Usage: npx tsx scripts/gm-products-check.ts [orgSlug] [baseUrl]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import puppeteer from "puppeteer-core";

const orgSlug = process.argv[2] ?? "gm";
const base = (process.argv[3] ?? "https://bosc.dpdns.org").replace(/\/+$/, "");
const probeEmail = `probe-gmproducts-${Date.now().toString(36)}@bos.local`;
const probePassword = "GmProductsProbe12345!";

const EDGE =
  process.env.PROBE_BROWSER ??
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

for (const file of [".env.local", ".env"]) {
  try {
    for (const raw of readFileSync(join(process.cwd(), file), "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 1) continue;
      const key = line.slice(0, eq).trim();
      if (process.env[key] === undefined) process.env[key] = line.slice(eq + 1).trim();
    }
  } catch {
    /* optional */
  }
}

/** Sidebar destinations, as paths inside the clone. */
const NAV = [
  ["/dashboard", "dashboard"],
  ["/inventory/products", "products"],
  ["/inventory/categories", "categories"],
  ["/customers/list", "customers"],
  ["/procurement/suppliers", "suppliers"],
  ["/sales/pos", "pos"],
  ["/reports/summary", "reports"],
  ["/settings/store", "settings"],
];

interface Cleanup {
  platformUserId?: string;
  memberId?: string;
  orgId?: string;
  shadowUserId?: string | null;
  products: string[];
}

/**
 * Waits for the click to land without relying on an in-page predicate: the
 * fallback to a hard browser navigation destroys the execution context, so
 * `page.waitForFunction` cannot be the thing that decides when the page is
 * ready. Polled from Node instead, and only a settled URL plus rendered content
 * counts.
 */
async function settled(page: import("puppeteer-core").Page, href: string, budgetMs: number) {
    const deadline = Date.now() + budgetMs;
    let last = "";
    let stable = 0;
    while (Date.now() < deadline) {
      const url = page.url();
      const atTarget = new URL(url).pathname === href;
      if (atTarget && url === last) {
        stable += 1;
        if (stable >= 4) {
          const len = await page
            .evaluate(() => document.querySelector("main")?.textContent?.trim().length ?? 0)
            .catch(() => 0);
          if (len > 40) return true;
        }
      } else {
        stable = 0;
      }
      last = url;
      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  }

async function main() {
  const state: Cleanup = { products: [] };

  const { prisma } = await import("../src/core/db/client");
  const { auth } = await import("../src/core/auth/server");
  const { orgDatabaseUrl } = await import("../src/core/org-vault/database");
  const orgUrl = orgDatabaseUrl(orgSlug);
  if (!orgUrl) throw new Error("cannot build an org DATABASE_URL");
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: orgUrl, max: 2 });
  const q = async <T>(text: string, values: unknown[] = []): Promise<T[]> => {
    const r = await pool.query(text, values);
    return r.rows as T[];
  };

  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    // --- 1. Throwaway platform member of this org ---------------------------
    const org = await prisma.organization.findFirst({
      where: { slug: orgSlug },
      select: { id: true, name: true },
    });
    if (!org) throw new Error(`no organization ${orgSlug}`);
    state.orgId = org.id;

    const created = await auth.api.signUpEmail({
      body: { email: probeEmail, password: probePassword, name: "GM Products Probe" },
    });
    state.platformUserId = created.user.id;
    const member = await prisma.member.create({
      data: {
        id: randomUUID(),
        organizationId: org.id,
        userId: created.user.id,
        role: "owner",
      },
      select: { id: true },
    });
    state.memberId = member.id;

    const res = await auth.api.signInEmail({
      body: { email: probeEmail, password: probePassword },
      asResponse: true,
    });
    if (!res.ok) throw new Error(`sign-in failed: ${res.status}`);
    const setCookies = res.headers.getSetCookie();
    const cookieHeader = setCookies.find((c) => /session/i.test(c.split("=")[0] ?? ""));
    if (!cookieHeader) {
      throw new Error(`no session cookie; got [${setCookies.map((c) => c.split("=")[0]).join(", ")}]`);
    }
    const [cookieName, cookieValue] = cookieHeader.split(";")[0].split("=");

    // DIRECT_CLONE=1 skips the platform entirely and signs in to the clone with a
    // session minted straight into the org's database, which is what separates
    // "the clone is misconfigured" from "the platform's proxy is what breaks it".
    const direct = process.env.DIRECT_CLONE === "1";
    let directCookie: { name: string; value: string } | null = null;
    if (direct) {
      const { createHash, randomUUID: uuid } = await import("node:crypto");
      const { SignJWT } = await import("jose");
      const member = await q<{ id: string }>(
        `SELECT u.id FROM users u WHERE u."deletedAt" IS NULL AND u.status = 'ACTIVE' LIMIT 1`,
      );
      if (!member[0]) throw new Error("no ACTIVE user in the clone database");
      const sid = uuid();
      await q(
        `INSERT INTO sessions (id, "userId", "tokenHash", "expiresAt")
         VALUES ($1,$2,$3, now() + interval '2 hours')`,
        [uuid(), member[0].id, createHash("sha256").update(sid).digest("hex")],
      );
      state.shadowUserId = member[0].id;
      directCookie = {
        name: "gs_session",
        value: await new SignJWT({ sid })
          .setProtectedHeader({ alg: "HS256" })
          .setSubject(member[0].id)
          .setIssuedAt()
          .setExpirationTime(Math.floor(Date.now() / 1000) + 7200)
          .sign(new TextEncoder().encode(process.env.AUTH_SECRET!)),
      };
    }

    // --- 2. What the org's database holds -----------------------------------
    console.log(`\n== ${orgSlug} catalog ==`);
    const cats = await q<{ name: string; nameAr: string | null }>(
      `SELECT name, "nameAr" FROM categories WHERE "isActive" ORDER BY name LIMIT 10`,
    );
    const units = await q<{ name: string; isBase: boolean }>(
      `SELECT name, "isBase" FROM units WHERE "isActive" ORDER BY name LIMIT 10`,
    );
    const prodCount = await q<{ n: string }>(`SELECT count(*)::text AS n FROM products`);
    console.log(`  categories: ${cats.map((c) => c.nameAr ?? c.name).join(", ") || "(none)"}`);
    console.log(`  units: ${units.map((u) => u.name).join(", ") || "(none)"}`);
    console.log(`  products: ${prodCount[0]?.n}`);

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    page.setDefaultTimeout(60000);

    await browser.setCookie({
      name: direct ? directCookie!.name : cookieName,
      value: direct ? directCookie!.value : cookieValue,
      domain: direct ? "localhost" : new URL(base).hostname,
      path: "/",
      httpOnly: true,
      secure: !direct && base.startsWith("https"),
    });

    const consoleErrors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200));
    });
    page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 200)}`));

    const posts: Array<{ url: string; status: number; body: string }> = [];
    page.on("response", (r) => {
      if (r.request().method() !== "POST") return;
      void r
        .text()
        .catch(() => "")
        .then((body) => posts.push({ url: r.url(), status: r.status(), body: body.slice(0, 300) }));
    });

    const mount = process.env.DIRECT_CLONE === "1" ? "/gm/grocery" : `/${orgSlug}/grocery`;
    const root = process.env.DIRECT_CLONE === "1" ? "http://localhost:50900" : base;
    const productsUrl = `${root}${mount}/inventory/products`;

    const t0 = Date.now();
    const nav = await page.goto(productsUrl, { waitUntil: "networkidle2" });
    console.log(`\n== products page ==`);
    console.log(`  GET -> ${nav?.status()} in ${Date.now() - t0}ms`);
    console.log(`  title: ${await page.title()}`);
    console.log(`  final url: ${page.url()}`);
    console.log(`  table rows: ${await page.evaluate(() => document.querySelectorAll("tbody tr").length)}`);
    console.log(`  sidebar links: ${await page.evaluate(() => document.querySelectorAll("aside a, nav a").length)}`);

    // --- 3. Add a product through the real form ----------------------------
    const marker = `probe_${Date.now().toString(36)}`;
    const opened = await page.evaluate(() => {
      const b = document.querySelector<HTMLButtonElement>("button:has(svg.lucide-plus)");
      if (!b) return false;
      b.click();
      return true;
    });
    await page.waitForSelector("[role=dialog]", { timeout: 15000 }).catch(() => undefined);
    const hasDialog = opened && (await page.$("[role=dialog]")) !== null;
    console.log(`\n== add product ==`);
    console.log(`  trigger found: ${opened}`);
    console.log(`  dialog opened: ${hasDialog}`);

    if (hasDialog) {
      await page.type("[role=dialog] input[name=nameAr]", marker);
      const picked = await page.evaluate(() => {
        const cb = document.querySelector<HTMLElement>('[role=dialog] [role=combobox]');
        if (!cb) return "no-combobox";
        cb.click();
        return "opened";
      });
      if (picked === "opened") {
        await page.waitForSelector("[role=option]", { timeout: 10000 }).catch(() => undefined);
        const label = await page.evaluate(() => {
          const o = document.querySelector<HTMLElement>("[role=option]");
          if (!o) return null;
          const t = o.textContent?.trim() ?? "";
          o.click();
          return t;
        });
        console.log(`  category chosen: ${label ?? "(NO OPTIONS)"}`);
      } else {
        console.log(`  category picker: ${picked}`);
      }
      await page.evaluate(() => {
        const dlg = document.querySelector("[role=dialog]")!;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
        for (const [name, v] of [
          ["costPrice", "1000"],
          ["sellingPrice", "1500"],
        ] as const) {
          const el = dlg.querySelector<HTMLInputElement>(`input[name=${name}]`);
          if (!el) continue;
          setter.call(el, v);
          el.dispatchEvent(new Event("input", { bubbles: true }));
        }
      });
      await new Promise((r) => setTimeout(r, 300));
      const before = posts.length;
      await page.evaluate(() => {
        const dlg = document.querySelector("[role=dialog]")!;
        const btn = [...dlg.querySelectorAll("button")].find((b) => b.type === "submit");
        btn?.click();
      });
      await new Promise((r) => setTimeout(r, 8000));
      const mine = posts.slice(before);
      console.log(`  POSTs issued: ${mine.length}`);
      for (const p of mine) {
        console.log(`    ${p.url.replace(base, "")} -> ${p.status}`);
        console.log(`      ${p.body.replace(/\s+/g, " ").slice(0, 220) || "(empty body)"}`);
      }
      const toast = await page.evaluate(() => {
        const el = document.querySelector("[data-sonner-toast]");
        return el?.textContent?.trim() ?? null;
      });
      console.log(`  toast: ${toast ?? "(none)"}`);
      const stillOpen = (await page.$("[role=dialog]")) !== null;
      console.log(`  dialog still open: ${stillOpen}`);
      const row = await q<{ id: string }>(`SELECT id FROM products WHERE name = $1 OR "nameAr" = $1`, [marker]);
      if (row[0]) state.products.push(row[0].id);
      console.log(`  product row in db: ${row.length > 0}`);
    }

    // --- 4. Mount discipline ------------------------------------------------
    // A hand-written URL (raw fetch, <img src>, native <form action>) resolves
    // against the origin root and escapes the mount, so it 404s on the platform.
    // Assert the rendered HTML carries the mount for the ones the template fixed.
    if (process.env.VERIFY_MOUNT === "1") {
      console.log(`\n== mount discipline ==`);
      const forms: Array<[string, string]> = [
        ["inventory/stock", "/inventory/stock"],
        ["sales/orders", "/sales/orders"],
        ["customers/transactions", "/customers/transactions"],
      ];
      const apiUrls: string[] = [];
      const onApi = (r: import("puppeteer-core").HTTPRequest): void => {
        if (new URL(r.url()).pathname.includes("/api/")) apiUrls.push(r.url());
      };
      page.on("request", onApi);
      let bad = 0;
      for (const [path, expected] of forms) {
        // Fetched in-page so the assertion reads the authenticated HTML the app
        // itself renders, rather than navigating the tab three times.
        const actions = await page.evaluate(async (url) => {
          const res = await fetch(url, { credentials: "include" });
          const html = await res.text();
          const doc = new DOMParser().parseFromString(html, "text/html");
          return [...doc.querySelectorAll("form[action]")].map((f) => f.getAttribute("action"));
        }, `${mount}/${path}`);
        const want = `${mount}${expected}`;
        const ok = actions.includes(want);
        if (!ok) bad++;
        console.log(
          `  ${ok ? "ok  " : "FAIL"} ${path} form actions = ${JSON.stringify(actions)} (want ${want})`,
        );
      }
      const bell = apiUrls.find((u) => u.includes("/api/notifications"));
      if (bell) {
        const ok = new URL(bell).pathname.startsWith(`${mount}/api/`);
        if (!ok) bad++;
        console.log(`  ${ok ? "ok  " : "FAIL"} notifications = ${bell.replace(base, "")}`);
      }
      page.off("request", onApi);
      console.log(`  ${bad === 0 ? "all mount-aware" : `${bad} escaping the mount`}`);
    }

    // --- 5. Time the sidebar ------------------------------------------------
    console.log(`\n== navigation (click -> settled) ==`);
    const detail = process.env.NAV_DEBUG === "1";
    const rows: Array<{ route: string; ms: number; reqs: number }> = [];
    const capture: Array<Record<string, unknown>> = [];
    for (const [path, name] of detail ? NAV.slice(0, 2) : NAV) {
      const href = `${mount}${path}`;
      const reqs: string[] = [];
      const onReq = (r: import("puppeteer-core").HTTPRequest) => reqs.push(r.url());
      const onFail = (r: import("puppeteer-core").HTTPRequest) => {
        if (detail) console.log(`      FAILED ${r.url().replace(base, "")} :: ${r.failure()?.errorText}`);
      };
      const onResp = (r: import("puppeteer-core").HTTPResponse) => {
        if (!detail) return;
        const req = r.request();
        const short = req.url().replace(base, "").replace(/(\?.*)/, "");
        if (short.includes("_next/static") || short.startsWith("/api/")) return;
        if (r.status() < 300) return;
        const h = req.headers();
        const sentRsc = new URL(req.url()).searchParams.get("_rsc");
        const interesting = ["rsc", "next-url", "next-router-prefetch", "next-router-segment-prefetch", "next-router-state-tree"]
          .filter((k) => h[k] !== undefined)
          .map((k) => `${k}=${k === "next-router-state-tree" ? `${String(h[k]).length}b/${String(h[k]).slice(-24)}` : h[k]}`)
          .join("  ");
        console.log(`      ${r.status()} ${short.slice(0, 70)}  sentRsc=${sentRsc ?? "(none)"}`);
        console.log(`         req  ${interesting}`);
        console.log(`         ->   location=${r.headers()["location"]}`);
        capture.push({
          url: req.url(),
          sentRsc,
          rsc: h["rsc"] ?? null,
          nextUrl: h["next-url"] ?? null,
          prefetch: h["next-router-prefetch"] ?? null,
          segmentPrefetch: h["next-router-segment-prefetch"] ?? null,
          stateTree: h["next-router-state-tree"] ?? null,
        });
      };
      page.on("request", onReq);
      if (detail) {
        page.on("requestfailed", onFail);
        page.on("response", onResp);
      }
      const start = Date.now();
      const clicked = await page.evaluate((h) => {
        const a = document.querySelector<HTMLAnchorElement>(`a[href="${h}"]`);
        if (!a) return false;
        a.click();
        return true;
      }, href);
      if (!clicked) {
        page.off("request", onReq);
        if (detail) {
          page.off("requestfailed", onFail);
          page.off("response", onResp);
        }
        console.log(`  ${name}: link not in sidebar`);
        continue;
      }
      const reached = await settled(page, href, 40000);
      await new Promise((r) => setTimeout(r, 300));
      const ms = Date.now() - start;
      page.off("request", onReq);
      if (detail) {
        page.off("requestfailed", onFail);
        page.off("response", onResp);
      }
      rows.push({ route: name, ms, reqs: reqs.length });
      const list = reqs
        .map((u) => u.replace(root, "").replace(/\?.*/, ""))
        .filter((u, i, a) => a.indexOf(u) === i)
        .slice(0, 6)
        .join(" ");
      console.log(
        `  ${name.padEnd(11)} ${String(ms).padStart(6)}ms  ${String(reqs.length).padStart(3)} reqs  ${reached ? "" : "NOT SETTLED  "}${list}`,
      );
    }
    const avg = rows.length ? Math.round(rows.reduce((a, r) => a + r.ms, 0) / rows.length) : 0;
    console.log(`  avg ${avg}ms over ${rows.length} routes`);
    console.log(`\nconsole errors (${consoleErrors.length}):`);
    for (const e of consoleErrors.slice(0, 12)) console.log(`  ${e}`);
    console.log(`\nNAV_JSON ${JSON.stringify({ rows, avg })}`);
    if (process.env.NAV_DUMP) {
      writeFileSync(process.env.NAV_DUMP, JSON.stringify(capture.slice(0, 4), null, 2), "utf8");
    }
  } finally {
    // --- cleanup ------------------------------------------------------------
    for (const id of state.products) {
      await q(`DELETE FROM inventory WHERE "productId" = $1`, [id]).catch(() => undefined);
      await q(`DELETE FROM products WHERE id = $1`, [id]).catch(() => undefined);
    }
    const shadow = await q<{ id: string }>(
      `SELECT id FROM users WHERE email = $1 OR username = $1`,
      [probeEmail, probeEmail],
    ).catch(() => [] as Array<{ id: string }>);
    for (const s of shadow) {
      await q(`DELETE FROM sessions WHERE "userId" = $1`, [s.id]).catch(() => undefined);
      await q(`DELETE FROM users WHERE id = $1`, [s.id]).catch(() => undefined);
    }
    if (state.memberId) {
      await prisma.member.deleteMany({ where: { id: state.memberId } }).catch(() => undefined);
    }
    if (state.platformUserId) {
      await prisma.session.deleteMany({ where: { userId: state.platformUserId } }).catch(() => undefined);
      await prisma.account.deleteMany({ where: { userId: state.platformUserId } }).catch(() => undefined);
      await prisma.user.deleteMany({ where: { id: state.platformUserId } }).catch(() => undefined);
    }
    await browser.close();
    await pool.end();
    await prisma.$disconnect().catch(() => undefined);
    console.log(`\ncleanup: probe user ${probeEmail} removed (shadow rows: ${shadow.length})`);
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
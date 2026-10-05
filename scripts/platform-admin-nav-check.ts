/**
 * Live diagnostic for the platform-admin console: how long does moving between
 * its pages actually take, and what does each click cost?
 *
 * Drives a real browser through the public URL, clicking the sidebar links that
 * an operator uses, and records per click: wall time to the new page being
 * rendered, how many requests it took, whether the browser issued an RSC request
 * (a client-side navigation) or fell back to loading the whole document, and how
 * long the server itself spent.
 *
 * Signs in as a throwaway `role = "admin"` account, which the console gate
 * requires, and removes it again in `finally`.
 *
 * Usage: npx tsx scripts/platform-admin-nav-check.ts [orgSlug] [baseUrl]
 */
import { readFileSync } from "node:fs";
import { promises as dnsPromises } from "node:dns";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const base = (process.argv[2] ?? "https://bosc.dpdns.org").replace(/\/+$/, "");
const probeEmail = `probe-panav-${Date.now().toString(36)}@bos.local`;
const probePassword = "PlatformAdminNav12345!";

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

/** The sidebar, in the order `PLATFORM_ADMIN_NAV` declares it. */
const ALL_NAV: Array<[string, string]> = [
  ["/platform-admin", "overview"],
  ["/platform-admin/approvals", "approvals"],
  ["/platform-admin/tenants", "tenants"],
  ["/platform-admin/plans", "plans"],
  ["/platform-admin/announcements", "announcements"],
  ["/platform-admin/systems", "systems"],
];

/** NAV_ONLY=tenants,announcements narrows the walk to a few routes. */
const NAV = process.env.NAV_ONLY
  ? ALL_NAV.filter(([href]) => process.env.NAV_ONLY!.split(",").some((f) => href.endsWith(f)))
  : ALL_NAV;

interface Row {
  route: string;
  /** Click → the new route is acknowledged (its skeleton, or its content). */
  feedbackMs: number;
  /** Click → the real page is rendered and `main` is no longer busy. */
  clickToContentMs: number;
  reqs: number;
  documentLoads: number;
  rscRequests: number;
  slowestResponseMs: number;
  slowestResponseUrl: string;
}

async function main() {
  const { prisma } = await import("../src/core/db/client");
  const { auth } = await import("../src/core/auth/server");

  let userId: string | null = null;

  // Chrome intermittently fails to resolve or connect to this deployment's public
  // host — ERR_NAME_NOT_RESOLVED and ERR_CONNECTION_TIMED_OUT on alternating runs,
  // while node's own https reaches it in ~400 ms the whole time. The host is
  // Cloudflare-fronted and publishes AAAA records; the browser prefers them, this
  // machine has no working IPv6 route, and it does not always fall back in time.
  // Handing Chrome the IPv4 that the system resolver agrees on removes that whole
  // class of failure without pinning an address: it is looked up per run.
  // NAV_CHROME_DNS=0 disables it.
  const host = new URL(base).hostname;
  const args = ["--no-sandbox", "--disable-dev-shm-usage"];
  if (process.env.NAV_CHROME_DNS !== "0" && !/^localhost$|^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const v4 = await dnsPromises
      .resolve4(host)
      .then((a) => a[0])
      .catch(() => undefined);
    if (v4) {
      args.push(`--host-resolver-rules=MAP ${host} ${v4}`);
      console.log(`chrome pinned to ${host} -> ${v4}`);
    }
  }

  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    args,
  });

  try {
    const created = await auth.api.signUpEmail({
      body: { email: probeEmail, password: probePassword, name: "PA Nav Probe" },
    });
    userId = created.user.id;
    await prisma.user.update({ where: { id: userId }, data: { role: "admin" } });

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

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    page.setDefaultTimeout(60000);
    await browser.setCookie({
      name: cookieName,
      value: cookieValue,
      domain: new URL(base).hostname,
      path: "/",
      httpOnly: true,
      secure: base.startsWith("https"),
    });

    // One cold document load to prove the gate lets this probe in at all.
    const t0 = Date.now();
    const cold = await page.goto(`${base}/platform-admin`, { waitUntil: "networkidle2" });
    console.log(`== cold load ==`);
    console.log(`  GET /platform-admin -> ${cold?.status()} in ${Date.now() - t0}ms`);
    console.log(`  title: ${await page.title()}`);
    console.log(`  url: ${page.url()}`);
    const sidebar = await page.evaluate(() =>
      [...document.querySelectorAll("aside a")].map((a) => (a as HTMLAnchorElement).getAttribute("href")),
    );
    console.log(`  sidebar links: ${JSON.stringify(sidebar)}`);
    await new Promise((r) => setTimeout(r, 1000));

    // The walk starts on `/platform-admin`, which is also its first target: that click
    // is a no-op, and a 20 ms no-op sitting in the averages overstates every other
    // route. Move to the last route in the walk first — unmeasured, and still
    // inside the console, because the admin nav only exists in this layout (parking
    // on `/profile` leaves a page with no sidebar at all).
    const last = NAV[NAV.length - 1]?.[0];
    if (last && new URL(page.url()).pathname !== last) {
      await page.goto(`${base}${last}`, { waitUntil: "networkidle2" });
      await new Promise((r) => setTimeout(r, 1000));
      console.log(`  parked on ${new URL(page.url()).pathname} so every click navigates`);
    }

    // A click that never commits shows up here as a timeout with no network
    // symptom at all, so the console and the URL after the wait are recorded
    // rather than inferred from timings.
    const consoleErrors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200));
    });
    page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 200)}`));

    const rows: Row[] = [];
    const hover = process.env.NAV_HOVER !== "0";

    for (const [href, name] of NAV) {
      const t = Date.now();
      const errorsBefore = consoleErrors.length;
      const trace: string[] = [];
      const reqs: string[] = [];
      const started = new Map<import("puppeteer-core").HTTPRequest, number>();
      const onReq = (r: import("puppeteer-core").HTTPRequest): void => {
        reqs.push(r.url());
        started.set(r, Date.now());
        trace.push(`+${Date.now() - t}ms REQ ${r.method()} ${r.resourceType()} ${r.url().replace(base, "")}`);
      };
      page.on("request", onReq);

      const pending: Array<{ url: string; ms: number }> = [];
      // Headers are not the answer for an RSC response: Next streams the layout
      // first and the page's own render later, so a 1 s header can carry a body
      // that lands 20 s later. `requestfinished` is when the body is complete.
      const onRes = (r: import("puppeteer-core").HTTPResponse): void => {
        const from = started.get(r.request());
        trace.push(
          `+${Date.now() - t}ms HDR ${r.status()} ${r.url().replace(base, "")} (${from === undefined ? "?" : Date.now() - from}ms)`,
        );
      };
      page.on("response", onRes);

      const onFinished = (r: import("puppeteer-core").HTTPRequest): void => {
        const from = started.get(r);
        if (from === undefined) return;
        const ms = Date.now() - from;
        pending.push({ url: r.url(), ms });
        trace.push(`+${Date.now() - t}ms END ${r.url().replace(base, "")} (${ms}ms body)`);
      };
      page.on("requestfinished", onFinished);

      const clicked = await page.evaluate(
        (h, doHover) => {
          const el = document.querySelector<HTMLAnchorElement>(`aside a[href="${h}"]`);
          if (!el) return false;
          // A real pointer hovers before it clicks, and the hover is what starts
          // a prefetch. NAV_HOVER=0 drops it, to tell "the router stalls" apart
          // from "the hover-prefetch and the click fight over one payload".
          if (doHover) el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
          el.click();
          return true;
        },
        href,
        hover,
      );

      if (!clicked) {
        page.off("request", onReq);
        page.off("response", onRes);
        page.off("requestfinished", onFinished);
        console.error(`  sidebar link not found: ${href}`);
        continue;
      }

      // Polled from Node rather than by an in-page predicate: a router that falls
      // back to a hard navigation destroys the execution context, so an in-page
      // wait can be the thing that never returns.
      //
      // Two numbers, because a loading boundary makes them different things and
      // conflating them flatters the app:
      //   feedbackMs — the click was acknowledged: the URL has committed and the
      //                 region belongs to the new route (its skeleton, or already
      //                 its content when the payload was cached).
      //   contentMs  — the real page is there: `main` has children and is not
      //                 marked `aria-busy`. This is the one to compare runs with.
      //                 Not a character count, because a page with no rows yet is
      //                 legitimately short (Announcements with nothing in it
      //                 renders 31 characters and used to look like a hang).
      const samples: string[] = [];
      const deadline = t + 20000;
      let contentMs = 0;
      let feedbackMs = 0;
      let finalUrl = "";
      while (Date.now() < deadline) {
        const snap = await page
          .evaluate(() => {
            const m = document.querySelector("main");
            return {
              path: location.pathname,
              chars: (m?.textContent ?? "").trim().length,
              nodes: m?.childElementCount ?? 0,
              busy: !!m?.querySelector('[aria-busy="true"]'),
              head: (m?.textContent ?? "").trim().slice(0, 60),
            };
          })
          .catch(() => ({ path: "<gone>", chars: 0, nodes: 0, busy: false, head: "" }));
        const atTarget = snap.path === href;
        if (atTarget && feedbackMs === 0) feedbackMs = Date.now() - t;
        if (atTarget && snap.nodes > 0 && !snap.busy) {
          contentMs = Date.now() - t;
          finalUrl = snap.path;
          break;
        }
        samples.push(
          `+${Date.now() - t}ms ${snap.path} main=${snap.chars}chars/${snap.nodes}nodes${snap.busy ? " BUSY" : ""} "${snap.head}"`,
        );
        await new Promise((r) => setTimeout(r, 200));
      }
      if (contentMs === 0) {
        contentMs = Date.now() - t;
        finalUrl = new URL(page.url()).pathname;
      }
      const errors = consoleErrors.slice(errorsBefore);
      await new Promise((r) => setTimeout(r, 300));
      page.off("request", onReq);
      page.off("response", onRes);
      page.off("requestfinished", onFinished);

      const isRsc = (u: string) => u.includes("_rsc=");
      const isDoc = (u: string) => {
        const p = new URL(u).pathname;
        return !u.includes("/_next/") && !isRsc(u) && p === href && (u.endsWith("/") || !/\.[a-z0-9]+$/i.test(p));
      };
      const docLoads = reqs.filter(isDoc).length;
      const rsc = reqs.filter(isRsc);
      const slowest = pending.reduce(
        (a, b) => (b.ms > a.ms ? b : a),
        { url: "", ms: 0 },
      );

      if (process.env.NAV_DEBUG === "1") {
        console.log(
          `\n== ${name} (feedback ${feedbackMs}ms, content ${contentMs}ms, ${reqs.length} reqs, ${docLoads} doc loads, final=${finalUrl}) ==`,
        );
        for (const line of trace) console.log(`  ${line}`);
        for (const line of samples) console.log(`  DOM ${line}`);
        for (const e of errors) console.log(`  CONSOLE ${e}`);
      }

      rows.push({
        route: name,
        feedbackMs,
        clickToContentMs: contentMs,
        reqs: reqs.length,
        documentLoads: docLoads,
        rscRequests: rsc.length,
        slowestResponseMs: slowest.ms,
        slowestResponseUrl: slowest.url.replace(base, ""),
      });
    }

    console.table(rows);
    const n = rows.length || 1;
    const avg = (pick: (r: Row) => number) => Math.round(rows.reduce((a, r) => a + pick(r), 0) / n);
    const worst = rows.reduce((a, r) => (r.clickToContentMs > a.clickToContentMs ? r : a), rows[0]!);
    const summary = {
      avgFeedbackMs: avg((r) => r.feedbackMs),
      avgClickToContentMs: avg((r) => r.clickToContentMs),
      avgRequestsPerClick: avg((r) => r.reqs),
      avgDocumentLoadsPerClick: avg((r) => r.documentLoads),
      worstRoute: worst?.route,
      worstClickToContentMs: worst?.clickToContentMs,
      totalRequests: rows.reduce((a, r) => a + r.reqs, 0),
      rows,
    };
    console.log(
      `avg feedback=${summary.avgFeedbackMs}ms  avg click-to-content=${summary.avgClickToContentMs}ms  reqs/click=${summary.avgRequestsPerClick}  documentLoads/click=${summary.avgDocumentLoadsPerClick}`,
    );
    console.log(`worst: ${summary.worstRoute} ${summary.worstClickToContentMs}ms`);
    console.log("NAV_JSON " + JSON.stringify(summary));
  } finally {
    if (userId) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }
    await browser.close();
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);

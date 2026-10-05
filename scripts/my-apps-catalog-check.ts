import "@/core/config/load-env";
import { randomUUID } from "node:crypto";
import puppeteer from "puppeteer-core";
import { prisma } from "@/core/db/client";
import { getCustomerMarketplace } from "@/core/apps/service";
import { catalogSeedRows } from "@/core/systems/catalog-seed";
import { dictionaries } from "@/core/i18n/dictionaries";

/**
 * `/{org}/my-apps` shows the whole system catalog, not only what the org owns.
 *
 * The 196 curated systems in `systems-catalog` were written down and invisible,
 * because nothing put them in the `app` table and the page listed installed
 * systems only. This drives the real page and asserts the properties that make
 * it useful rather than merely long:
 *  - the named org actually receives the catalog (checked server-side, so the
 *    real organization is never written to);
 *  - coming-soon systems are labelled as a promise, not as platform-disabled;
 *  - a coming-soon system is refused by the API, so the hidden button is not the
 *    only thing standing between a customer and an install that cannot work;
 *  - "installed only" narrows to what the org owns, which is the whole reason
 *    the page can hold 198 cards.
 *
 * Run: npx tsx scripts/my-apps-catalog-check.ts
 */
const BASE = "http://localhost:3100";
const PW = "Sodb!123456789";
const GM_SNOW = "gm-snow";

// Labels come from the dictionary, not from memory. The first version of this
// check hardcoded "إضافة النظام" and reported 0 install buttons against a page
// that was working, because the real label is "تثبيت نظام" - a false failure
// pointing at working code, which is the most expensive kind of failure.
const AR = dictionaries.ar.platform.marketplace;

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) {
    passed++;
    console.log(`PASS  ${name}${detail ? ` :: ${detail}` : ""}`);
  } else {
    failures.push(name);
    console.log(`FAIL  ${name}${detail ? ` :: ${detail}` : ""}`);
  }
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
    args: ["--no-sandbox"],
  });
  const stamp = Date.now();
  const email = `sodb+${stamp}@probe.local`;
  const org = await prisma.organization.create({
    data: { id: randomUUID(), name: "Probe MyApps", slug: `probe-myapps-${stamp}`, status: "active" },
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1200 });
  const errors: string[] = [];
  // Tag every error with the URL it happened on: a hydration mismatch on the
  // marketplace page and one on my-apps are different bugs, and a flat list
  // cannot tell them apart.
  let phase = "startup";
  page.on("pageerror", (e) => errors.push(`[${phase}] pageerror: ${e instanceof Error ? e.message : String(e)}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`[${phase}] console: ${m.text()}`);
  });

  try {
    // 1. The named org, server-side. The org id is enough to prove the catalog
    //    reaches THIS org, and it needs no membership write on a real org.
    const gm = await prisma.organization.findUnique({
      where: { slug: GM_SNOW },
      select: { id: true, name: true },
    });
    check("gm-snow exists", Boolean(gm), JSON.stringify(gm));

    if (gm) {
      const market = await getCustomerMarketplace(gm.id, "unrelated-user-id");
      const seedRows = catalogSeedRows();
      const states = market.reduce<Record<string, number>>((acc, m) => {
        acc[m.state] = (acc[m.state] ?? 0) + 1;
        return acc;
      }, {});
      check(
        "gm-snow receives the full catalog",
        market.length === seedRows.length + 2,
        `entries=${market.length} (${seedRows.length} catalog + 2 pre-existing real systems)`,
      );
      check(
        "gm-snow sees the installed system as installed",
        market.filter((m) => m.state === "installed").length >= 1,
        `states=${JSON.stringify(states)}`,
      );
      check(
        "coming-soon systems are labelled soon, not unavailable",
        (states.soon ?? 0) === seedRows.filter((r) => r.soon).length,
        `soon=${states.soon ?? 0} unavailable=${states.unavailable ?? 0}`,
      );
      check(
        "nothing in the catalog is marked platform-disabled",
        (states.unavailable ?? 0) === 0,
        `unavailable=${states.unavailable ?? 0}`,
      );
    }

    // 2. The rendered page, driven as a member of a throwaway org. Same
    //    component and same catalog, so this covers the visual without adding a
    //    member row to a real organization.
    await page.goto(`${BASE}/signin`, { waitUntil: "domcontentloaded" });
    const up = await page.evaluate(
      async (m: string, x: string) => {
        const r = await fetch("/api/auth/sign-up/email", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: m, password: x, name: "SODB" }),
        });
        return r.status;
      },
      email,
      PW,
    );
    const u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    check("probe user created", up < 400 && Boolean(u), `status=${up}`);
    if (!u) throw new Error("no probe user");

    await prisma.member.create({
      data: { id: randomUUID(), organizationId: org.id, userId: u.id, role: "owner" },
    });
    const grocery = await prisma.app.findUnique({ where: { slug: "grocery" }, select: { id: true, version: true } });
    if (grocery) {
      await prisma.organizationApp.create({
        data: {
          id: randomUUID(),
          organizationId: org.id,
          appId: grocery.id,
          status: "active",
          version: grocery.version,
          activatedAt: new Date(),
        },
      });
    }
    await prisma.session.updateMany({ where: { userId: u.id }, data: { activeOrganizationId: org.id } });

    phase = "my-apps";
    const resp = await page.goto(`${BASE}/${org.slug}/my-apps`, { waitUntil: "networkidle2" });
    check("org my-apps returns 200", resp?.status() === 200, `status=${resp?.status()}`);

    const info = await page.evaluate(
      (labels: { install: string; soon: string; open: string; installedOnly: string }) => {
        const body = document.body.innerText;
        const cards = Array.from(
          document.querySelectorAll("div.group, a.group, div[class*='rounded-2xl']"),
        ).filter(
          (n) =>
            n.className?.toString?.().includes("group") || n.className?.toString?.().includes("rounded-2xl"),
        );
        return {
          h1: document.querySelector("h1")?.textContent ?? "",
          cards: new Set(cards).size,
          soon: (body.match(new RegExp(labels.soon, "g")) ?? []).length,
          installBtns: Array.from(document.querySelectorAll("button")).filter((b) =>
            (b.textContent || "").includes(labels.install),
          ).length,
          openLinks: Array.from(document.querySelectorAll("a")).filter((a) =>
            (a.textContent || "").includes(labels.open),
          ).length,
          hasSignOut: body.includes("تسجيل الخروج"),
          searchBox: Boolean(document.querySelector("input[placeholder]")),
          installedOnly: body.includes(labels.installedOnly),
countLine: (body.match(/(\d+)\s+نظاماً\s+—\s+(\d+)\s+مثبت/) ?? []).slice(1).join(" / "),
          demoCards: document.querySelectorAll(".demo-card").length,
          revealArmed: document.querySelectorAll("[data-reveal]").length,
          spotlightCards: document.querySelectorAll("[data-spotlight]").length,
          particleWall: Boolean(document.querySelector("canvas.fixed")),
          pinnedBar: Boolean(document.querySelector(".sticky")),
        };
      },
      { install: AR.addSystem, soon: AR.stateSoon, open: AR.open, installedOnly: AR.installedOnly },
    );

    check("org name is the heading", info.h1 === "Probe MyApps", `h1=${info.h1}`);
    check("renders the whole catalog", info.cards > 100, `cards=${info.cards}`);
    // Each soon card renders the state label twice (badge + footer), so the count
    // is a multiple of the card count rather than equal to it.
    check("coming-soon cards are labelled", info.soon > 100, `soonLabels=${info.soon}`);
    check("installable systems offer setup", info.installBtns > 0, `installButtons=${info.installBtns}`);
    check("installed system offers open", info.openLinks > 0, `openLinks=${info.openLinks}`);
    check("search available", info.searchBox);
    check("installed-only filter available", info.installedOnly);
    check("sign-out still present", info.hasSignOut);
    check("grid size is stated in the header", info.countLine.length > 0, `count=${info.countLine}`);
    check("cards carry the demo visual style", info.demoCards > 100, `demoCards=${info.demoCards}`);
    check("scroll reveal is armed for the whole grid", info.revealArmed > 100, `dataReveal=${info.revealArmed}`);
    check("cards carry the cursor spotlight", info.spotlightCards > 100, `spotlight=${info.spotlightCards}`);
    // The wallpaper is a `ssr: false` dynamic import, so its canvas only appears
    // after the client bundle mounts - a beat after network-idle. Poll instead of
    // asserting at the first snapshot, which would report a slow mount as absent.
    let wallReady = false;
    for (let i = 0; i < 20 && !wallReady; i++) {
      await new Promise((r) => setTimeout(r, 250));
      wallReady = await page.evaluate(() => Boolean(document.querySelector("canvas.fixed")));
    }
    check("the particle wallpaper renders", wallReady, wallReady ? "canvas.fixed mounted" : "no canvas.fixed after 5s");
    check("the filter bar is pinned for long scrolls", info.pinnedBar);

    // The category pills were reported in English ("cat is in english?"). They
    // are the visible regression this checks: every pill button rendered inside
    // the pills strip must carry Arabic text, not a raw latin category slug.
    const pillCheck = await page.evaluate(() => {
      const pills = Array.from(document.querySelectorAll('[role="group"] button'));
      return {
        total: pills.length,
        nonArabic: pills
          .filter((p) => !/[\u0600-\u06FF]/.test(p.textContent ?? ""))
          .map((p) => (p.textContent ?? "").trim()),
      };
    });
    check(
      "category pills are localized to Arabic",
      pillCheck.total > 3 && pillCheck.nonArabic.length === 0,
      `pills=${pillCheck.total} nonArabic=[${pillCheck.nonArabic.join(" | ")}]`,
    );

    // 3. The installed-only filter must narrow to exactly what the org owns.
    //    Wait for React to attach the handler first: a `.click()` on
    //    server-rendered HTML before hydration is silently swallowed, which is
    //    what made the first run report a filter that was working.
    const countLabels = async () =>
      page.evaluate(
        (labels: { soon: string; open: string }) => {
          const body = document.body.innerText;
          return {
            soon: (body.match(new RegExp(labels.soon, "g")) ?? []).length,
            open: (body.match(new RegExp(labels.open, "g")) ?? []).length,
          };
        },
        { soon: AR.stateSoon, open: AR.open },
      );

    // Poll for the outcome instead of sleeping a fixed 700ms. If React has to
    // repair the tree, the click can land against a tree that is about to be
    // replaced, and a fixed sleep then reports a working filter as broken. A
    // retry loop distinguishes "slow" from "does not work" without hiding either.
    let after = { soon: 370, open: 0 };
    let filterOk = false;
    for (let attempt = 0; attempt < 4 && !filterOk; attempt++) {
      await page.waitForFunction(
        (label: string) => {
          const btn = Array.from(document.querySelectorAll("button")).find((b) =>
            (b.textContent || "").includes(label),
          ) as (HTMLElement & { [k: string]: unknown }) | undefined;
          if (!btn) return false;
          const key = Object.keys(btn).find((k) => k.startsWith("__reactProps"));
          if (!key) return false;
          return typeof (btn[key] as { onClick?: unknown }).onClick === "function";
        },
        { timeout: 20000 },
        AR.installedOnly,
      );
      await page.evaluate((label: string) => {
        const b = Array.from(document.querySelectorAll("button")).find((x) =>
          (x.textContent || "").includes(label),
        );
        b?.click();
      }, AR.installedOnly);
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 200));
        after = await countLabels();
        if (after.soon === 0) {
          filterOk = true;
          break;
        }
      }
    }
    check(
      "installed-only hides every coming-soon card",
      after.soon === 0 && after.open > 0,
      `soon=${after.soon} open=${after.open} hydrationErrors=${errors.filter((m) => /hydrat|didn.t match/i.test(m)).length}`,
    );

    // Everything above is the page under test. The deliberate 400 below is the
    // check working, so console errors are snapshotted before it fires -
    // otherwise the browser logs the rejection and the page looks unhealthy.
    const pageErrorsBeforeProbe = errors.length;

    // 4. The install path must be real: a coming-soon system is refused by the
    //    API, not merely hidden by the UI.
    const soonSlug = catalogSeedRows().find((r) => r.soon)?.slug;
    if (soonSlug) {
      const res = await page.evaluate(async (slug: string) => {
        const r = await fetch(`/api/v1/apps/${slug}/request`, { method: "POST" });
        return { status: r.status };
      }, soonSlug);
      check("coming-soon system is refused by the API", res.status === 400, `slug=${soonSlug} status=${res.status}`);
      const installed = await prisma.organizationApp.count({
        where: { organizationId: org.id, app: { slug: soonSlug } },
      });
      check("refused system left no install row", installed === 0, `rows=${installed}`);
    }

    // 5. The marketplace page shares this grid, and the component was moved out
    //    of the route tree so a page could reuse it. A move is exactly the kind
    //    of change that leaves one caller silently broken.
    phase = "apps";
    const marketResp = await page.goto(`${BASE}/apps`, { waitUntil: "networkidle2" });
    const marketCards = await page.evaluate(() => document.querySelectorAll("div.group").length);
    check(
      "marketplace page still renders the grid",
      marketResp?.status() === 200 && marketCards > 100,
      `status=${marketResp?.status()} cards=${marketCards}`,
    );

    // 6. A returning customer has "recently opened" systems in localStorage.
    //    The recents strip used to be seeded in a state initializer, which
    //    cannot exist on the server - so the SSR HTML had no recents and the
    //    first client render did, and React threw the tree away. Reproduce that
    //    state deliberately instead of waiting for it to show up in the wild.
    phase = "recents";
    await page.evaluateOnNewDocument(() => {
      window.localStorage.setItem("bos_systems_recent", JSON.stringify(["grocery", "sama-center"]));
    });
    const recentsErrors: string[] = [];
    const onErr = (e: unknown) => recentsErrors.push(e instanceof Error ? e.message : String(e));
    page.on("pageerror", onErr);
    await page.goto(`${BASE}/${org.slug}/my-apps`, { waitUntil: "networkidle2" });
    await new Promise((r) => setTimeout(r, 1200));
    page.off("pageerror", onErr);
    const hydrationErrors = recentsErrors.filter((m) => /hydrat|didn.t match|mismatch/i.test(m));
    const recentsRendered = await page.evaluate((title: string) => document.body.innerText.includes(title), AR.recentTitle);
    check(
      "a returning customer (localStorage recents) hydrates cleanly",
      hydrationErrors.length === 0,
      hydrationErrors[0]?.slice(0, 200) ?? recentsErrors.slice(0, 1).join(" ").slice(0, 200),
    );
    // Proof the recents path was actually exercised, so the check above is not
    // passing simply because the strip never rendered.
    check("the recents strip rendered for a returning customer", recentsRendered, `looking for "${AR.recentTitle}"`);

    const hydrationDetails = errors.filter((m) => /hydrat|didn.t match|mismatch/i.test(m));
    if (hydrationDetails.length) {
      // Never truncate this. The one-line summary React prints in production
      // ("server rendered HTML didn't match the client") does not name the
      // component, and guessing which one costs more than printing all of it.
      console.log("\n--- FULL HYDRATION ERROR (first occurrence) ---\n" + hydrationDetails[0] + "\n---");
    }
    check(
      "no console errors while using the page",
      pageErrorsBeforeProbe === 0,
      errors.slice(0, 3).join(" || "),
    );

// 7. The one thing the grid exists for: a setup button that actually does
    //    something. Adding a system ALWAYS lands in the platform-approval queue
    //    now, so the click must produce a pending request — and, equally
    //    important, NOT an install row: the shop is gated by a human, not by
    //    self-service.
    //
    //    It runs last on purpose. In the old flow the click navigated to the new
    //    system's route; today it must stay put, and the console assertion above
    //    has already been made on the page under test.
    phase = "request";
    const probeMarket = await getCustomerMarketplace(org.id, u.id);
    const target = probeMarket.find((m) => m.state === "installable");
    if (!target) {
      check("an installable system exists to click", false, "none found");
    } else {
      const countRequests = () =>
        prisma.organizationAppRequest.count({
          where: { organizationId: org.id, app: { slug: target.slug }, status: "pending" },
        });
      const countOrgRows = () =>
        prisma.organizationApp.count({ where: { organizationId: org.id, app: { slug: target.slug } } });
      const beforeRequests = await countRequests();

      // Watch the network so a failed request reports WHY (403, 409, 500) rather
      // than just "request count did not move".
      const posts: string[] = [];
      const onResponse = (r: { url(): string; status(): number }) => {
        if (r.url().includes("/api/v1/apps/") && r.url().includes("/request")) {
          posts.push(`${r.status()} ${r.url().replace(BASE, "")}`);
        }
      };
      page.on("response", onResponse);

      // Scope the click to the card for this system. "First button matching the
      // label" would request whichever of the 8 happens to sort first, which is
      // a different test than the one intended.
      const appRow = await prisma.app.findUnique({
        where: { slug: target.slug },
        select: { name: true, nameAr: true },
      });
      const names = [appRow?.nameAr, appRow?.name].filter((n): n is string => Boolean(n));

      const clicked = await page.evaluate(
        (input: { request: string; names: string[] }) => {
          const cards = Array.from(document.querySelectorAll("div.group"));
          const card = cards.find((c) => {
            const text = c.textContent || "";
            return input.names.some((n) => text.includes(n));
          });
          const btn = card
            ? Array.from(card.querySelectorAll("button")).find((b) => (b.textContent || "").includes(input.request))
            : undefined;
          if (!btn) return `no button (card found=${Boolean(card)}, cards=${cards.length}, names=${input.names.join("|")})`;
          btn.click();
          return "clicked";
        },
        { request: AR.addSystem, names },
      );

      let afterRequests = beforeRequests;
      for (let i = 0; i < 40 && afterRequests === beforeRequests; i++) {
        await new Promise((r) => setTimeout(r, 500));
        afterRequests = await countRequests();
      }
      const afterOrgRows = await countOrgRows();
      page.off("response", onResponse);
      check(
        "clicking setup sends a pending approval request",
        afterRequests === beforeRequests + 1 && posts.some((p) => p.startsWith("200")),
        `slug=${target.slug} name="${target.name}" requests ${beforeRequests} -> ${afterRequests}; click=${clicked}; post=${posts.join(", ") || "none"}`,
      );
      check(
        "a request alone installs nothing",
        afterOrgRows === 0,
        `orgApp rows=${afterOrgRows} (request must wait for the platform admin)`,
      );

      // The card flips to the pending state (the footer's "waiting for
      // approval" label) rather than redirecting.
      let pendingLabelSeen = false;
      for (let i = 0; i < 10 && !pendingLabelSeen; i++) {
        await new Promise((r) => setTimeout(r, 300));
        pendingLabelSeen = await page.evaluate((label: string) => document.body.innerText.includes(label), AR.pendingWait);
      }
      check("the card now reads as pending review", pendingLabelSeen, `looking for "${AR.pendingWait}"`);
    }
  } finally {
    await browser.close();
    await prisma.organizationApp.deleteMany({ where: { organizationId: org.id } });
    await prisma.organizationAppRequest.deleteMany({ where: { organizationId: org.id } });
    await prisma.member.deleteMany({ where: { organizationId: org.id } });
    await prisma.auditLog.deleteMany({ where: { organizationId: org.id } });
    await prisma.organization.deleteMany({ where: { id: org.id } });
    const uu = await prisma.user.findUnique({ where: { email } });
    if (uu) {
      await prisma.auditLog.deleteMany({ where: { actorUserId: uu.id } });
      await prisma.member.deleteMany({ where: { userId: uu.id } });
      await prisma.session.deleteMany({ where: { userId: uu.id } });
      await prisma.account.deleteMany({ where: { userId: uu.id } });
      await prisma.user.deleteMany({ where: { id: uu.id } });
    }
    await prisma.$disconnect();
  }

  console.log(`\n${passed}/${passed + failures.length} checks passed`);
  if (failures.length) {
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

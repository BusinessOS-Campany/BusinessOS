import "@/core/config/load-env";
import { randomUUID } from "node:crypto";
import puppeteer from "puppeteer-core";
import { prisma } from "@/core/db/client";

/**
 * Every sign-out control in the app, on every surface it appears on.
 *
 * This exists because sign-out used to be implemented five separate times, and
 * two of them were broken in ways that looked identical to the user - "the
 * button does nothing":
 *
 *  - the org app list used a native `<form action="/api/auth/sign-out"
 *    method="post">`, which Better Auth answers with **415** because a form POST
 *    sends `application/x-www-form-urlencoded`. The session survived, and
 *    because a form submit *is* a navigation, the browser replaced the page with
 *    the raw JSON error served from `/api/auth/sign-out`. The user was left
 *    looking at the API endpoint, still signed in.
 *  - the platform-admin control called a bare `signOut()` with no navigation:
 *    the cookie was cleared but the admin page stayed on screen.
 *
 * A check that only covers the profile cannot catch either of those, so this
 * asserts the *substantive* property for every control: after the click the
 * server reports no session, and the browser is no longer showing a signed-in
 * page. Navigation alone is not enough - a control can redirect while leaving
 * the session alive, which is the failure that is easiest to miss.
 */
const BASE = "http://localhost:3100";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PW = "Sodb!123456789";

let passed = 0;
const failures: string[] = [];
const authCalls: string[] = [];
const runtimeErrors: string[] = [];

function check(name: string, ok: boolean, detail = ""): void {
  if (ok) {
    passed++;
    console.log(`PASS  ${name}${detail ? ` :: ${detail}` : ""}`);
  } else {
    failures.push(name);
    console.log(`FAIL  ${name}${detail ? ` :: ${detail}` : ""}`);
  }
}

interface Surface {
  name: string;
  path: (slug: string) => string;
  /** Text or attribute identifying the control within the page. */
  find: string;
}

const SURFACES: Surface[] = [
  { name: "profile header", path: (s) => `/${s}/profile`, find: "header button:تسجيل الخروج" },
  { name: "org app list", path: (s) => `/${s}/my-apps`, find: "button:تسجيل الخروج" },
  { name: "legacy /my-apps", path: () => "/my-apps", find: "button:تسجيل الخروج" },
  { name: "app sidebar", path: () => "/app/products", find: "button:تسجيل الخروج" },
  { name: "grocery sidebar", path: () => "/app/grocery", find: "button:تسجيل الخروج" },
  { name: "sama sidebar", path: () => "/app/sama-center", find: "button:تسجيل الخروج" },
  { name: "platform admin", path: () => "/platform-admin", find: "button:تسجيل الخروج" },
];

async function freshSignIn(page: import("puppeteer-core").Page, email: string): Promise<void> {
  await page.goto(`${BASE}/signin`, { waitUntil: "domcontentloaded" });
  const res = await page.evaluate(
    async (m: string, p: string) => {
      const r = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: m, password: p }),
      });
      return r.status;
    },
    email,
    PW,
  );
  if (res >= 400) throw new Error(`sign-in failed: ${res}`);
}

async function serverHasSession(page: import("puppeteer-core").Page): Promise<boolean | null> {
  return page.evaluate(async () => {
    const r = await fetch("/api/auth/get-session", { method: "GET" });
    const text = await r.text();
    if (!text) return false;
    try {
      const j = JSON.parse(text) as { session?: unknown } | null;
      return Boolean(j && j.session);
    } catch {
      return null;
    }
  });
}

async function main() {
  const stamp = Date.now();
  const email = `sodb+${stamp}@probe.local`;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
  const org = await prisma.organization.create({
    data: { id: randomUUID(), name: "SODB", slug: `sodb-org-${stamp}`, status: "active" },
  });
  const appIds: string[] = [];
  try {
    const up = await fetch(`${BASE}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE, referer: `${BASE}/signup` },
      body: JSON.stringify({ email, password: PW, name: "SODB" }),
    });
    if (up.status >= 400) throw new Error(`sign-up ${up.status}`);
    const row = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!row) throw new Error("probe user not created");
    await prisma.member.create({ data: { id: randomUUID(), organizationId: org.id, userId: row.id, role: "owner" } });
    // platform-admin requires the admin role.
    await prisma.user.update({ where: { id: row.id }, data: { role: "admin" } });
    // Make sure the module apps exist so the /app/* layouts render a sidebar.
    for (const slug of ["grocery", "sama-center"]) {
      const app = await prisma.app.findFirst({ where: { slug } });
      if (!app) continue;
      const existing = await prisma.organizationApp.findFirst({ where: { organizationId: org.id, appId: app.id } });
      if (existing) continue;
      appIds.push(app.id);
      await prisma.organizationApp.create({
        data: { id: randomUUID(), organizationId: org.id, appId: app.id, status: "active", version: app.version, activatedAt: new Date() },
      });
    }

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000 });
    page.on("dialog", (d) => void d.dismiss());
    page.on("console", (m) => {
      if (m.type() === "error") runtimeErrors.push(`console: ${m.text()}`);
    });
    page.on("pageerror", (e) => runtimeErrors.push(`pageerror: ${e instanceof Error ? e.message : String(e)}`));
    // Every auth response, so a throttle or a 5xx shows up as data instead of
    // being guessed at from a symptom.
    page.on("response", (r) => {
      const u = new URL(r.url());
      if (u.pathname.startsWith("/api/auth/")) authCalls.push(`${r.status()} ${u.pathname}`);
    });

    for (const surface of SURFACES) {
      const path = surface.path(org.slug);
      await freshSignIn(page, email);
      // /app/* and the legacy /my-apps resolve the org from the *session's*
      // activeOrganizationId, not from the URL, so a freshly signed-in probe
      // with no active org is bounced to /select-org and never reaches the
      // sidebar under test.
      await prisma.session.updateMany({
        where: { userId: row.id },
        data: { activeOrganizationId: org.id },
      });
      const before = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle2" });
      if (!before || before.status() >= 400) {
        check(`${surface.name}: page reachable`, false, `status=${before?.status()} path=${path}`);
        continue;
      }

      // Wait for React to attach the click handler before clicking.
      //
      // A control can be present in the server HTML and still be completely
      // inert: React has not hydrated it, so the click is swallowed and no
      // request is ever made. Right after a route compiles in dev this is the
      // normal state, which is why an unguarded click makes this check fail on
      // a *random* surface each run.
      //
      // The signal is deliberately the handler itself, not a proxy like a sleep
      // or a localStorage value: localStorage survives navigation, so a
      // ThemeProvider-written key reads non-null on the second page even before
      // it hydrates, and passes while the click still does nothing. React stores
      // the props it wired up on the DOM node, so a non-function `onClick` there
      // means the node is server HTML and the click will be ignored.
      const live = await page
        .waitForFunction(
          (needle: string) => {
            const [sel, text] = needle.split(":");
            const target = Array.from(document.querySelectorAll(sel)).find(
              (n) => (n.textContent || "").trim() === text,
            ) as (HTMLElement & { [k: string]: unknown }) | undefined;
            if (!target) return false;
            const key = Object.keys(target).find((k) => k.startsWith("__reactProps"));
            if (!key) return false;
            return typeof (target[key] as { onClick?: unknown }).onClick === "function";
          },
          { timeout: 20000 },
          surface.find,
        )
        .then(() => true)
        .catch(() => false);
      if (!live) {
        check(`${surface.name}: control is interactive`, false, `url=${page.url()} selector=${surface.find}`);
        continue;
      }

      const clicked = await page.evaluate((needle: string) => {
        const [sel, text] = needle.split(":");
        const nodes = Array.from(document.querySelectorAll(sel));
        const target = nodes.find((n) => (n.textContent || "").trim() === text) as HTMLElement | undefined;
        if (!target) return false;
        target.click();
        return true;
      }, surface.find);

      if (!clicked) {
        check(`${surface.name}: control found`, false, `selector=${surface.find} url=${page.url()}`);
        continue;
      }
      const callsBefore = authCalls.length;
      const errorsBefore = runtimeErrors.length;
      // Record the button's state immediately after the click: `disabled` is set
      // by the pending guard, so seeing it flip proves the handler ran and that
      // any later failure is downstream of it, not a swallowed event.
      const afterClick = await page
        .evaluate((needle: string) => {
          const [sel, text] = needle.split(":");
          const target = Array.from(document.querySelectorAll(sel)).find(
            (n) => (n.textContent || "").trim() === text,
          ) as (HTMLButtonElement & { [k: string]: unknown }) | undefined;
          if (!target) return "element gone";
          return `disabled=${String(target.disabled)} ariaBusy=${target.getAttribute("aria-busy") ?? "-"}`;
        }, surface.find)
        .catch((e) => `evaluate failed: ${String(e)}`);
      // Pair the click with the navigation: a poll afterwards would run in a
      // context the navigation has already destroyed.
      await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => null),
        new Promise((r) => setTimeout(r, 400)),
      ]);
      await new Promise((r) => setTimeout(r, 1200));

      const url = page.url();
      const landedOnSignin = new URL(url).pathname === "/signin";
      const notAnApiUrl = !url.includes("/api/auth/sign-out");
      const stillSignedIn = await serverHasSession(page);
      const calls = authCalls.slice(callsBefore).join(" | ") || "(no /api/auth call)";
      const errs = runtimeErrors.slice(errorsBefore).join(" | ") || "(none)";

      check(
        `${surface.name}: signs out and leaves the page`,
        landedOnSignin && notAnApiUrl && stillSignedIn === false,
        `url=${url} serverSession=${String(stillSignedIn)} afterClick=${afterClick} authCalls=${calls} errors=${errs}`,
      );
    }

    await page.close();
  } finally {
    await browser.close();
    for (const id of appIds) {
      await prisma.organizationApp.deleteMany({ where: { appId: id, organizationId: org.id } });
    }
    await prisma.member.deleteMany({ where: { organizationId: org.id } });
    await prisma.auditLog.deleteMany({ where: { organizationId: org.id } });
    await prisma.organization.deleteMany({ where: { id: org.id } });
    const u = await prisma.user.findUnique({ where: { email } });
    if (u) {
      await prisma.auditLog.deleteMany({ where: { actorUserId: u.id } });
      await prisma.member.deleteMany({ where: { userId: u.id } });
      await prisma.session.deleteMany({ where: { userId: u.id } });
      await prisma.account.deleteMany({ where: { userId: u.id } });
      await prisma.user.deleteMany({ where: { id: u.id } });
    }
    await prisma.$disconnect();
  }

  console.log(`\n${passed}/${passed + failures.length} checks passed`);
  if (failures.length) {
    console.log("failures:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

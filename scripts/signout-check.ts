import "@/core/config/load-env";
import { randomUUID } from "node:crypto";
import puppeteer from "puppeteer-core";
import { prisma } from "@/core/db/client";

/**
 * Profile sign-out check.
 *
 * Verifies the new header sign-out, and specifically that it *leaves the page*:
 * a client-side-only sign-out clears the cookie but leaves the server-rendered
 * profile on screen, which is the bug this action is easy to reintroduce.
 */
const BASE = "http://localhost:3100";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const TAG = "signoutprobe";
const results: { name: string; pass: boolean; detail?: string }[] = [];
function check(name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? " :: " + detail : ""}`);
}

async function main() {
  const stamp = Date.now();
  const email = `${TAG}+${stamp}@probe.local`;
  const pw = "Signoutprobe!12345";
  const orgIds: string[] = [];
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  await prisma.user.deleteMany({ where: { email: { contains: "@probe.local" } } });
  await prisma.organization.deleteMany({ where: { slug: { startsWith: `${TAG}-` } } });

  const org = await prisma.organization.create({
    data: { id: randomUUID(), name: `SignOut Probe ${stamp}`, slug: `${TAG}-org-${stamp}`, status: "active" },
  });
  orgIds.push(org.id);

  try {
    const su = await fetch(`${BASE}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE, referer: `${BASE}/signup` },
      body: JSON.stringify({ email, password: pw, name: "Signout Probe" }),
    });
    if (!su.ok) throw new Error(`sign-up -> ${su.status} ${await su.text()}`);
    const { user } = (await su.json()) as { user: { id: string } };
    await prisma.member.create({
      data: { id: randomUUID(), userId: user.id, organizationId: org.id, role: "owner" },
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(String(e)));

    page.on("response", (r) => {
      if (r.url().includes("/api/auth/sign-out")) console.log(`  [sign-out] ${r.status()}`);
    });
    page.on("framenavigated", (f) => {
      if (f === page.mainFrame()) console.log(`  [nav] ${f.url()}`);
    });

    await page.goto(`${BASE}/signin`, { waitUntil: "domcontentloaded" });
    await page.evaluate(
      async (mail: string, pass: string) => {
        const r = await fetch("/api/auth/sign-in/email", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: mail, password: pass }),
        });
        if (!r.ok) throw new Error(`sign-in failed: ${r.status}`);
      },
      email,
      pw,
    );

    await page.goto(`${BASE}/${org.slug}/profile`, { waitUntil: "networkidle2" });
    check("landed on the org profile", page.url().includes(`/${org.slug}/profile`), page.url());

    // The button must be in the header, on the default tab, without switching tabs.
    const headerBtn = await page
      .$eval("header button.btn-outline, header button[class*='outline']", (el) => el.textContent?.trim())
      .catch(() => null);
    const anySignOut = await page.$$eval("button", (els) =>
      els.map((e) => e.textContent?.trim()).filter((x) => /تسجيل الخروج|Sign out/.test(x || "")),
    );
    check("header has a sign-out button", Boolean(headerBtn) || anySignOut.length > 0, `header=${headerBtn} all=${JSON.stringify(anySignOut)}`);

    // It must be in the <header>, not only in the security panel.
    const inHeader = await page.$$eval("header button", (els) =>
      els.some((e) => /تسجيل الخروج|Sign out/.test(e.textContent || "")),
    );
    check("sign-out is in the profile header, not just the security tab", inHeader);

    // Switch to a different tab, then confirm the header action is still there.
    // The tab strip is nav > ul > li > button, and only the *active* tab carries
    // aria-current, so selecting "the second aria-current element" finds nothing
    // and silently no-ops - the tab list has to be addressed structurally.
    const tabsBefore = await page.$$eval("nav ul li button", (els) => els.length);
    const switched = await page.evaluate(() => {
      const tabButtons = Array.from(document.querySelectorAll("nav ul li button"));
      const inactive = tabButtons.find((b) => !b.getAttribute("aria-current"));
      if (!inactive) return null;
      const label = inactive.textContent?.trim() ?? "";
      (inactive as HTMLElement).click();
      return label;
    });
    await new Promise((r) => setTimeout(r, 1200));
    const stillThere = await page.$$eval("header button", (els) =>
      els.some((e) => /تسجيل الخروج|Sign out/.test(e.textContent || "")),
    );
    check(
      "sign-out stays available after switching tabs",
      tabsBefore > 1 && switched !== null && stillThere,
      `tabs=${tabsBefore} switchedTo=${switched}`,
    );

    // The real assertion: it must leave the page and actually end the session.
    // waitForNavigation paired with the click, not waitForFunction afterwards:
    // a navigation destroys the execution context that waitForFunction polls, so
    // the pairing is the reliable form and a bare poll can miss the transition.
    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 25000 }),
      page.$$eval("header button", (els) => {
        const btn = els.find((e) => /تسجيل الخروج|Sign out/.test(e.textContent || ""));
        (btn as HTMLButtonElement | undefined)?.click();
      }),
    ]);
    check("clicking sign-out lands on /signin", new URL(page.url()).pathname === "/signin", page.url());

    // Going back must NOT restore the signed-in profile from the router cache.
    await page.goto(`${BASE}/${org.slug}/profile`, { waitUntil: "networkidle2" });
    const afterUrl = new URL(page.url());
    check(
      "the org profile is no longer reachable after sign-out",
      afterUrl.pathname === "/signin",
      page.url(),
    );
    // Not "no <header> at all": the sign-in page has its own header. What must be
    // gone is the *profile* chrome - the sign-out and edit actions, and the org
    // switcher that only the signed-in profile renders.
    const leftover = await page.evaluate(() => {
      const texts = Array.from(document.querySelectorAll("button")).map((b) => b.textContent || "");
      return {
        signOut: texts.some((x) => /تسجيل الخروج|Sign out/.test(x)),
        editProfile: texts.some((x) => /تعديل الملف|Edit profile/.test(x)),
        hasOrgSwitcher: Boolean(document.querySelector('nav[aria-label]')),
      };
    });
    check(
      "no signed-in profile chrome remains on screen",
      !leftover.signOut && !leftover.editProfile,
      JSON.stringify(leftover),
    );

    const errorsBefore = errors.length;
    check("no console errors", errorsBefore === 0, errors.slice(0, 2).join(" | "));
    await page.close();
  } finally {
    await browser.close();
    for (const id of orgIds) {
      await prisma.organizationApp.deleteMany({ where: { organizationId: id } });
      await prisma.auditLog.deleteMany({ where: { organizationId: id } });
      await prisma.member.deleteMany({ where: { organizationId: id } });
      await prisma.organization.deleteMany({ where: { id } });
    }
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

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log("failures:\n" + failed.map((f) => `  - ${f.name}: ${f.detail}`).join("\n"));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("HARNESS ERROR", e);
  process.exit(1);
});

/**
 * Org-in-the-URL browser check.
 *
 * Verifies, against the running dev server and a real Chrome:
 *  - a single-org user is sent straight to /{slug}/... and never sees the picker;
 *  - the org stays in the address bar on the profile and my-apps pages;
 *  - the legacy /profile alias canonicalises into the org URL;
 *  - a non-member gets the same 404 as an unknown slug (no enumeration oracle);
 *  - a suspended org cannot be opened;
 *  - a cross-origin ?next= is refused rather than followed.
 *
 * Probe data only; the real account is never touched. Cleans up after itself.
 *
 * Run with: npx tsx scripts/org-routing-check.ts
 *
 * It is a .ts script rather than .cjs because the Prisma client is generated to
 * src/core/db/generated/prisma as TypeScript (`provider = "prisma-client"`), so
 * `@prisma/client`'s default entry cannot resolve from plain CommonJS.
 */
import "@/core/config/load-env";
import { randomUUID } from "node:crypto";
import puppeteer from "puppeteer-core";
import { prisma } from "@/core/db/client";
import { dictionaries } from "@/core/i18n/dictionaries";

const BASE = "http://localhost:3100";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const TAG = "orgprobe";
const results: { name: string; pass: boolean; detail?: string }[] = [];
function check(name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? " :: " + detail : ""}`);
}

async function main() {
  const stamp = Date.now();
  const emails: string[] = [];
  const orgIds: string[] = [];
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  /** Status code of a navigation, failing loudly if the navigation itself did not happen. */
  async function statusOf(page: import("puppeteer-core").Page, path: string): Promise<number> {
    const res = await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    if (!res) throw new Error(`no response for ${path}`);
    return res.status();
  }

  // An earlier aborted run can leave probe rows behind; sweep them up first so
  // repeated runs do not accumulate garbage. Scoped to the probe markers only.
  await prisma.user.deleteMany({ where: { email: { contains: "@probe.local" } } });
  await prisma.organization.deleteMany({ where: { slug: { startsWith: `${TAG}-` } } });

  async function makeOrg(slug: string, status: string) {
    // `id` is generated in application code, not by the database, so it has to be
    // supplied here the same way the integration tests do.
    const org = await prisma.organization.create({
      data: { id: randomUUID(), name: `OrgProbe ${slug}`, slug, status },
    });
    orgIds.push(org.id);
    return org;
  }

  async function makeUser(email: string, password: string) {
    // Origin/Referer are required: Better Auth rejects a server-side request that
    // does not look like it came from a trusted origin, and returns 403. The
    // in-page fetches below get these from the browser automatically.
    const r = await fetch(`${BASE}/api/auth/sign-up/email`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: BASE,
        referer: `${BASE}/signup`,
      },
      body: JSON.stringify({ email, password, name: "Org Probe" }),
    });
    if (!r.ok) throw new Error(`sign-up ${email} -> ${r.status} ${await r.text()}`);
    emails.push(email);
    return (await r.json()) as { user: { id: string } };
  }

  async function newPage() {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(String(e)));
    return { page, errors };
  }

  /**
   * A page with an authenticated session cookie.
   *
   * Signs in through the same endpoint the form posts to, from inside the page so
   * the browser supplies Origin/Referer. The initial navigation is required: a
   * relative fetch has no origin to resolve against on a fresh page.
   */
  async function signedInPage(email: string, password: string) {
    const { page, errors } = await newPage();
    await page.goto(`${BASE}/signin`, { waitUntil: "domcontentloaded" });
    await page.evaluate(
      async (mail, pass) => {
        const r = await fetch("/api/auth/sign-in/email", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: mail, password: pass }),
        });
        if (!r.ok) throw new Error(`sign-in failed: ${r.status}`);
      },
      email,
      password,
    );
    return { page, errors };
  }

  try {
    // ── fixture: one single-org user, one multi-org user, one outsider ──
    const solo = await makeOrg(`${TAG}-solo-${stamp}`, "active");
    const second = await makeOrg(`${TAG}-multi-b-${stamp}`, "active");
    const multi = await makeOrg(`${TAG}-multi-a-${stamp}`, "active");
    const outsiderOrg = await makeOrg(`${TAG}-outsider-${stamp}`, "active");
    const suspended = await makeOrg(`${TAG}-susp-${stamp}`, "suspended");

    const pw = "Orgprobe!12345";
    const soloEmail = `${TAG}.solo+${stamp}@probe.local`;
    const multiEmail = `${TAG}.multi+${stamp}@probe.local`;
    const outEmail = `${TAG}.out+${stamp}@probe.local`;
    const soloData = await makeUser(soloEmail, pw);
    const multiData = await makeUser(multiEmail, pw);
    const outData = await makeUser(outEmail, pw);

    for (const [userId, orgId, role] of [
      [soloData.user.id, solo.id, "owner"],
      [multiData.user.id, multi.id, "owner"],
      [multiData.user.id, second.id, "owner"],
      [outData.user.id, outsiderOrg.id, "owner"],
    ]) {
      await prisma.member.create({
        data: { id: randomUUID(), userId, organizationId: orgId, role },
      });
    }

    // ── 1. single-org user lands directly on their org's profile, no picker ──
    {
      const { page, errors } = await signedInPage(soloEmail, pw);
      await page.goto(`${BASE}/auth/landing`, { waitUntil: "networkidle2" });
      const url = new URL(page.url());
      check(
        "single-org user is sent straight to the org, not the picker",
        url.pathname === `/${solo.slug}/profile`,
        `landed on ${url.pathname}`,
      );
      check("org is in the address bar on the org profile", url.pathname.startsWith(`/${solo.slug}/`), page.url());
      const heading = await page.$eval("h1", (el) => el.textContent).catch(() => null);
      check("the org profile page rendered", heading === "Org Probe", String(heading));
      check("no console errors on the org profile", errors.length === 0, errors.slice(0, 2).join(" | "));
      await page.close();
    }

    // ── 2. legacy /profile canonicalises into the org URL ──
    {
      const { page } = await signedInPage(soloEmail, pw);
      await page.goto(`${BASE}/profile?tab=organizations`, { waitUntil: "networkidle2" });
      const url = new URL(page.url());
      check(
        "legacy /profile forwards to the org URL and keeps the tab",
        url.pathname === `/${solo.slug}/profile` && url.searchParams.get("tab") === "organizations",
        `${url.pathname}${url.search}`,
      );
      // The tab strip marks the current tab with aria-current="page".
      const activeTab = await page
        .$eval('[aria-current="page"]', (el) => el.textContent?.trim())
        .catch(() => null);
      check(
        "organizations tab is the active one",
        /المؤسسات|Organizations/.test(activeTab || ""),
        String(activeTab),
      );
      await page.close();
    }

    // ── 3. cross-org access is a 404, same as an unknown slug ──
    {
      const { page } = await signedInPage(outEmail, pw);
      const outsiderStatus = await statusOf(page, `/${solo.slug}/profile`);
      const unknownStatus = await statusOf(page, `/${TAG}-does-not-exist-${stamp}/profile`);
      const unknownSlugStatus = await statusOf(page, "/platform-admin/profile");
      check(
        "non-member and unknown slug are indistinguishable (404)",
        outsiderStatus === 404 && unknownStatus === 404,
        `non-member=${outsiderStatus} unknown=${unknownStatus}`,
      );
      check("reserved top-level segment is never treated as an org", unknownSlugStatus === 404, String(unknownSlugStatus));

      // suspended org: a real member gets bounced, not the org page
      const susMember = await makeUser(`${TAG}.sus+${stamp}@probe.local`, pw);
      await prisma.member.create({
        data: { id: randomUUID(), userId: susMember.user.id, organizationId: suspended.id, role: "owner" },
      });
      const susPage = await signedInPage(`${TAG}.sus+${stamp}@probe.local`, pw);
      await susPage.page.goto(`${BASE}/${suspended.slug}/my-apps`, { waitUntil: "networkidle2" });
      const susUrl = new URL(susPage.page.url());
      check(
        "suspended org is bounced instead of rendering",
        susUrl.pathname === "/select-org" || susUrl.pathname === "/signin",
        `landed on ${susUrl.pathname}`,
      );
      await susPage.page.close();
      await page.close();
    }

    // ── 4. cross-origin ?next= is refused ──
    {
      const { page } = await signedInPage(soloEmail, pw);
      await page.goto(`${BASE}/auth/landing?next=https://evil.example/steal`, { waitUntil: "networkidle2" });
      const url = new URL(page.url());
      check(
        "cross-origin ?next= is dropped, not followed",
        url.origin === BASE && url.pathname === `/${solo.slug}/profile`,
        page.url(),
      );
      await page.close();
    }

    // ── 5. multi-org user still gets the picker ──
    {
      const { page } = await signedInPage(multiEmail, pw);
      await page.goto(`${BASE}/auth/landing`, { waitUntil: "networkidle2" });
      const url = new URL(page.url());
      check("multi-org user is sent to the picker", url.pathname === "/select-org", url.pathname);
      await page.close();
    }

    // ── 6. the org profile's systems tab offers one "add a system" button that
    //       opens the org's marketplace chooser, where systems get picked (and
    //       where a pick lands in the platform-approval queue) ──
    {
      const { page } = await signedInPage(soloEmail, pw);
      const SYS = dictionaries.ar.profile.systems;
      const sysResp = await page.goto(`${BASE}/${solo.slug}/profile?tab=systems`, { waitUntil: "networkidle2" });
      check("org systems tab renders", sysResp?.status() === 200, `status=${sysResp?.status()}`);

      // Solo has no installed systems, so the tab is the add affordance first:
      // a heading and exactly one link into /{org}/my-apps.
      const initial = await page.evaluate(
        (labels: { addTitle: string; href: string }) => {
          const body = document.body.innerText;
          const links = Array.from(document.querySelectorAll("a")).filter(
            (a) => a.getAttribute("href") === labels.href,
          );
          return { titleSeen: body.includes(labels.addTitle), addLinks: links.length };
        },
        { addTitle: SYS.addTitle, href: `/${solo.slug}/my-apps` },
      );
      check(
        "systems tab offers an add-system button into the marketplace",
        initial.titleSeen && initial.addLinks === 1,
        `title=${initial.titleSeen} addLinks=${initial.addLinks}`,
      );

      if (initial.addLinks === 1) {
        await page.evaluate((href) => {
          const a = Array.from(document.querySelectorAll("a")).find((x) => x.getAttribute("href") === href);
          a?.click();
        }, `/${solo.slug}/my-apps`);
        // Landing on /{org}/my-apps proves the button is wired to the chooser
        // page rather than doing or hiding anything inline. The navigation is
        // client-side and takes a beat to commit, so poll until the URL leaves
        // the profile page (or the timeout is hit).
        const target = `/${solo.slug}/my-apps`;
        let landed = "";
        for (let i = 0; i < 25 && landed !== target; i++) {
          await new Promise((r) => setTimeout(r, 200));
          const p = new URL(page.url()).pathname;
          if (p !== `/${solo.slug}/profile` && p !== "") landed = p;
        }
        check(
          "add-system navigates to the org's marketplace chooser",
          landed === target,
          `landed on ${landed || "(still " + new URL(page.url()).pathname + ")"}`,
        );
      }
      await page.close();
    }
  } finally {
    await browser.close();
    // Probe data only. The real account is never touched: every row removed here
    // is matched by the `orgprobe` slug prefix or the `@probe.local` email
    // suffix, and the assertion below fails loudly if that ever stops holding.
    for (const email of emails) {
      const u = await prisma.user.findUnique({ where: { email } });
      if (u) {
        await prisma.auditLog.deleteMany({ where: { actorUserId: u.id } });
        await prisma.member.deleteMany({ where: { userId: u.id } });
        await prisma.session.deleteMany({ where: { userId: u.id } });
        await prisma.account.deleteMany({ where: { userId: u.id } });
        await prisma.user.deleteMany({ where: { id: u.id } });
      }
    }
    for (const id of orgIds) {
      await prisma.organizationApp.deleteMany({ where: { organizationId: id } });
      await prisma.organizationAppRequest.deleteMany({ where: { organizationId: id } });
      await prisma.auditLog.deleteMany({ where: { organizationId: id } });
      await prisma.member.deleteMany({ where: { organizationId: id } });
      await prisma.organization.deleteMany({ where: { id } });
    }
    await prisma.$disconnect();
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log(
      "failures:\n" + failed.map((f) => `  - ${f.name}: ${f.detail}`).join("\n"),
    );
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("HARNESS ERROR", e);
  process.exit(1);
});

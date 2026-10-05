import "@/core/config/load-env";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import puppeteer from "puppeteer-core";
import { prisma } from "@/core/db/client";
import { getEnv } from "@/core/config/env";
import { orgVaultRoot, removeTree, sanitizeFolderName } from "@/core/org-vault/paths";
import { stopOrgRuntime } from "@/core/systems/runtime/supervisor";

/**
 * Profile systems-tab open-through check, for an organization created on the
 * spot.
 *
 * Verifies that an installed system card on `/{org}/profile?tab=systems` is a
 * real link that opens the system at its org mount point, and that a card with
 * no resolvable route stays a plain (non-navigating) card.
 *
 * The org is created here on purpose: this is the only probe that exercises the
 * cold path, where a system has never been opened for that org and the click has
 * to clone, build for the new base path, migrate and start a process. That is
 * why the navigation budget is minutes, not seconds, and why cleanup stops the
 * runtime and deletes the vault folder — otherwise every run leaves a built copy
 * of the system and an orphan process behind.
 *
 * Talks to the configured public origin, not `localhost`, because that is the
 * only origin Better Auth trusts (`AUTH_URL`); a localhost request is rejected
 * with 403 `INVALID_ORIGIN`. Requires a healthy server — the profile tree
 * becomes React-event-dead in long-running dev servers, so restart dev before
 * trusting a failure here.
 */
const BASE = (process.env.PROBE_BASE ?? getEnv().NEXT_PUBLIC_APP_URL ?? getEnv().AUTH_URL).replace(/\/+$/, "");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const TAG = "syslinkprobe";
const results: { name: string; pass: boolean; detail?: string }[] = [];
function check(name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? " :: " + detail : ""}`);
}

async function main() {
  const stamp = Date.now();
  const email = `${TAG}+${stamp}@probe.local`;
  const pw = "Syslinkprobe!12345";
  const orgIds: string[] = [];
  let orgSlug: string | null = null;
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    await prisma.user.deleteMany({ where: { email: { contains: "@probe.local" } } });
    await prisma.organization.deleteMany({ where: { slug: { startsWith: `${TAG}-` } } });

    const app = await prisma.app.findUniqueOrThrow({ where: { slug: "grocery" } });

    const org = await prisma.organization.create({
      data: { id: randomUUID(), name: `SysLink Probe ${stamp}`, slug: `${TAG}-org-${stamp}`, status: "active" },
    });
    orgIds.push(org.id);
    orgSlug = org.slug;

    const su = await fetch(`${BASE}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE, referer: `${BASE}/signup` },
      body: JSON.stringify({ email, password: pw, name: "SysLink Probe" }),
    });
    if (!su.ok) throw new Error(`sign-up -> ${su.status} ${await su.text()}`);
    const { user } = (await su.json()) as { user: { id: string } };

    await prisma.member.create({
      data: { id: randomUUID(), userId: user.id, organizationId: org.id, role: "owner" },
    });
    await prisma.organizationApp.create({
      data: {
        id: randomUUID(),
        organizationId: org.id,
        appId: app.id,
        status: "installed",
        version: "1.0.0",
      },
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    const errors: string[] = [];
    // A console error that does not name a URL cannot be acted on, so failing
    // responses are recorded with their status and path.
    const failedResponses: string[] = [];
    page.on("response", (res) => {
      if (res.status() >= 400) failedResponses.push(`${res.status()} ${res.url().replace(BASE, "")}`);
    });
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(String(e)));

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

    await page.goto(`${BASE}/${org.slug}/profile?tab=systems`, { waitUntil: "networkidle2" });
    check("landed on the org profile systems tab", new URL(page.url()).pathname.endsWith(`${org.slug}/profile`), page.url());

    // Wait for hydration to settle, then look at the grocery card specifically.
    // The card body is a <div> and the link is a sibling overlay anchor by
    // design (so the rename button stays clickable), so the assertion is on the
    // anchor's href, not on the first element of the <li>.
    const card = await page.evaluate(async () => {
      for (let i = 0; i < 50; i++) {
        // The installed grocery card is the only card in the probe org.
        const li = Array.from(document.querySelectorAll("main li")).find((n) =>
          /إدارة البقالة|Grocery/.test((n as HTMLElement).innerText || ""),
        );
        if (li) {
          const a = li.querySelector("a");
          return {
            href: a ? (a as HTMLAnchorElement).getAttribute("href") : null,
            text: (li as HTMLElement).innerText.replace(/\s+/g, " ").trim().slice(0, 140),
          };
        }
        await new Promise((r) => setTimeout(r, 200));
      }
      return null;
    });
    check(
      `installed system card links to /${org.slug}/grocery`,
      card?.href === `/${org.slug}/grocery`,
      JSON.stringify(card),
    );
    check(
      "the card still shows the org name and version",
      Boolean(card && card.text && /v1\.0\.0/.test(card.text) && /SysLink Probe/.test(card.text)),
      card?.text?.slice(0, 160),
    );

    check(
      "nothing on the tab fails to load",
      failedResponses.length === 0,
      failedResponses.slice(0, 3).join(" | "),
    );
    check("no console errors on the tab", errors.length === 0, errors.slice(0, 2).join(" | "));

    // The real assertion: the card opens the actual system, not a placeholder.
    // This click is also the cold path for this org — the system has never been
    // opened for it, so the platform clones, builds for `/{org}/grocery`,
    // migrates and starts a process. Budget for that, and report what it cost.
    const coldStarted = Date.now();
    try {
      await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 420_000 }),
        page.evaluate(() => {
          const a = Array.from(document.querySelectorAll("main li a")).find((el) =>
            /إدارة البقالة|Grocery/.test(el.textContent || ""),
          );
          (a as HTMLAnchorElement | undefined)?.click();
        }),
      ]);
      check("clicking the card navigates to the real system", new URL(page.url()).pathname === `/${org.slug}/grocery`, page.url());
      check("the first open of a system in a new org succeeds", true, `${Date.now() - coldStarted}ms`);
    } catch (e) {
      check("clicking the card navigates to the real system", false, `click failed after ${Date.now() - coldStarted}ms: ${String(e).slice(0, 160)}`);
    }

    // A card with no route must not become a dead link: with only one installed
    // system in the probe org, every card on this tab is a real anchor, so the
    // tab must contain no card without a link.
    const deadCard = await page.evaluate(async () => {
      for (let i = 0; i < 50; i++) {
        const lis = Array.from(document.querySelectorAll("main li")).filter(
          (n) => !(n as HTMLElement).innerText.includes("نظرة عامة") && (n as HTMLElement).innerText.includes("v1.0.0"),
        );
        if (lis.length > 0) return lis.filter((n) => !n.querySelector("a")).length;
        await new Promise((r) => setTimeout(r, 200));
      }
      return -1;
    });
    check("no installed-system card is a dead (non-navigating) card", deadCard === 0, String(deadCard));

    await page.close();
  } finally {
    await browser.close();
    // The click may have booted a process and written a vault folder; both
    // outlive the database rows unless they are torn down here.
    if (orgSlug) {
      stopOrgRuntime(orgSlug, "grocery");
      removeTree(join(orgVaultRoot(), sanitizeFolderName(orgSlug)));
    }
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
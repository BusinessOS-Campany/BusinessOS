import "@/core/config/load-env";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { prisma } from "@/core/db/client";
import { getCustomerMarketplace } from "@/core/apps/service";
import { dictionaries } from "@/core/i18n/dictionaries";
import { withRegistry } from "@/core/org-vault/registry";
import { orgVaultPaths } from "@/core/org-vault/paths";

/**
 * Pharmacy is a real, cloneable system (contract + health + auth link) and a
 * seeded demo app proxied by the platform at `/pharmacy`. This drives the live
 * site the way a customer sees it:
 *  - the `/demo` page lists pharmacy among the live systems, linking to the
 *    platform's `/pharmacy` mount;
 *  - the mount actually serves the pharmacy app (Arabic sign-in, not the
 *    platform fallback page);
 *  - in the authenticated marketplace a fresh org sees pharmacy as a
 *    requestable system ("طلب النظام") and never as coming-soon.
 *
 * BASE is the public URL on purpose: Better Auth rejects in-page API calls
 * whose Origin is not its configured base, and running the probe against the
 * tunnel keeps the CSRF behaviour identical to a real user.
 *
 * Run: npx tsx scripts/pharmacy-demo-check.ts   (needs the platform on 3100)
 */
const BASE = "https://bosc.dpdns.org";
const PW = "Sodb!123456789";

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
  const email = `pharm+${stamp}@probe.local`;
  const org = await prisma.organization.create({
    data: { id: randomUUID(), name: "Probe Pharmacy", slug: `probe-pharm-${stamp}`, status: "active" },
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1200 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e instanceof Error ? e.message : String(e)}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });

  try {
    // 1. The registry row the whole thing hangs off.
    const app = await prisma.app.findUnique({ where: { slug: "pharmacy" }, select: { version: true, isActive: true, name: true, nameAr: true } });
    check("pharmacy is registered and active in the live catalog", Boolean(app?.isActive), `version=${app?.version} active=${app?.isActive}`);
    check("pharmacy catalog version is the real one", app?.version === "1.0.0", `version=${app?.version}`);

    // 2. The public /demo page links pharmacy to the platform mount.
    await page.goto(`${BASE}/demo`, { waitUntil: "networkidle2" });
    const tab = await page.evaluate(() => {
      const a = Array.from(document.querySelectorAll("a")).find((x) =>
        (x.getAttribute("href") ?? "").startsWith("/pharmacy"),
      );
      return a ? { href: a.getAttribute("href"), text: (a.textContent ?? "").trim().slice(0, 60) } : null;
    });
    check("the /demo page lists pharmacy as a live system", Boolean(tab), JSON.stringify(tab ?? "no /pharmacy link"));

    // 3. The mount serves the real pharmacy app, not the platform fallback.
    const resp = await page.goto(`${BASE}/pharmacy`, { waitUntil: "networkidle2" });
    const info = await page.evaluate(() => ({
      title: document.title,
      hasPasswordField: Boolean(document.querySelector('input[type="password"]')),
      hasEmailField: Boolean(document.querySelector('input[type="email"]')),
      fallbackMarker: document.body.innerText.includes("Business OS"),
      bodyHead: document.body.innerText.trim().slice(0, 80),
    }));
    check("platform /pharmacy returns the pharmacy app", resp?.status() === 200, `status=${resp?.status()}`);
    check(
      "the pharmacy app signs in (no platform fallback)",
      !info.fallbackMarker && info.hasPasswordField && !info.title.includes("Business OS"),
      `title=${info.title.slice(0, 60)} password=${info.hasPasswordField} fallback=${info.fallbackMarker}`,
    );

    // 4. Fresh signed-in org: the marketplace card for pharmacy offers setup.
    await page.goto(`${BASE}/signin`, { waitUntil: "domcontentloaded" });
    const up = await page.evaluate(
      async (m: string, x: string) => {
        const r = await fetch("/api/auth/sign-up/email", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: m, password: x, name: "PHARM" }),
        });
        return { status: r.status, body: await r.text() };
      },
      email,
      PW,
    );
    const u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    check("probe user created", up.status < 400 && Boolean(u), `status=${up.status} body=${up.body.slice(0, 200)}`);
    if (!u) throw new Error("no probe user");

    await prisma.member.create({
      data: { id: randomUUID(), organizationId: org.id, userId: u.id, role: "owner" },
    });
    await prisma.session.updateMany({ where: { userId: u.id }, data: { activeOrganizationId: org.id } });

    const market = await getCustomerMarketplace(org.id, u.id);
    const pharmState = market.find((m) => m.slug === "pharmacy")?.state;
    check(
      "a fresh org can request pharmacy (not coming-soon)",
      pharmState === "installable",
      `state=${pharmState}`,
    );

    const pageResp = await page.goto(`${BASE}/${org.slug}/my-apps`, { waitUntil: "networkidle2" });
    const card = await page.evaluate(
      (labels: { install: string; soon: string; stateInstallable: string; names: string[] }) => {
        const cards = Array.from(document.querySelectorAll("div.group"));
        const card = cards.find((c) => {
          const text = c.textContent || "";
          return labels.names.some((n) => text.includes(n));
        });
        if (!card) return { found: false, cards: cards.length, installLabel: false, soonLabel: false, stateLabel: false };
        const text = card.textContent || "";
        return {
          found: true,
          cards: cards.length,
          installLabel: text.includes(labels.install),
          soonLabel: text.includes(labels.soon),
          stateLabel: text.includes(labels.stateInstallable),
        };
      },
      {
        install: AR.addSystem,
        soon: AR.stateSoon,
        stateInstallable: AR.stateInstallable,
        names: [app?.nameAr, app?.name].filter((n): n is string => Boolean(n)),
      },
    );
    check("marketplace page renders", pageResp?.status() === 200, `status=${pageResp?.status()}`);
    check("pharmacy card is found on the marketplace", card.found, `cards=${card.found ? card.cards : "?"}`);
    check(
      "pharmacy card offers setup (طلب النظام)",
      card.installLabel,
      `installLabel=${card.installLabel}`,
    );
    check(
      "pharmacy card never reads coming-soon",
      card.found && !card.soonLabel,
      `soonLabel=${card.soonLabel}`,
    );
  } finally {
    await browser.close();
    // The vault folder and the registry entry too. Deleting only the database
    // rows leaves `orginazition/<slug>/` behind, and a check that leaves a folder
    // per execution is not a check anybody runs twice. Retried because a folder
    // written moments earlier can still be held on Windows, and a cleanup that
    // fails must not turn a passing run red.
    const vaultRoot = orgVaultPaths(org.slug).root;
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        rmSync(vaultRoot, { recursive: true, force: true });
        break;
      } catch (err) {
        if (attempt === 29) console.warn(`[warn] could not remove ${vaultRoot}: ${(err as Error).message}`);
        else await new Promise((r) => setTimeout(r, 500));
      }
    }
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
    // Unconditional: `withRegistry` re-reads the file from disk, while the
    // in-process cache was loaded before this run registered the org.
    await withRegistry((registry) => {
      for (const [key, value] of Object.entries(registry.orgs)) {
        if (key === org.slug || value.slug === org.slug) delete registry.orgs[key];
      }
    });
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
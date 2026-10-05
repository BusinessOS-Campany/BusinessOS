import "@/core/config/load-env";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { prisma } from "@/core/db/client";
import { withRegistry } from "@/core/org-vault/registry";
import { orgVaultPaths } from "@/core/org-vault/paths";

/**
 * The profile systems tab must offer a VISIBLE way into an installed system.
 *
 * The card was already a link — an invisible `absolute inset-0 z-0` overlay over
 * the whole card — so it was navigable by clicking anywhere, which is exactly why
 * it read as a label rather than a control: a badge, a version chip and a rename
 * button, with nothing that looks like "open". This asserts the affordance exists
 * and points at the org's own copy, and that it is the same href the overlay
 * carries, so the two cannot disagree.
 */
const BASE = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://bosc.dpdns.org";
const PW = "Sodb!123456789";

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
  const email = `sodb+${stamp}@profileopen.local`;
  const org = await prisma.organization.create({
    data: { id: randomUUID(), name: "Probe ProfileOpen", slug: `probe-profileopen-${stamp}`, status: "active" },
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1200 });

  try {
    const su = await fetch(`${BASE}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE, referer: `${BASE}/signup` },
      body: JSON.stringify({ email, password: PW, name: "Probe" }),
    });
    const uj = (await su.json()) as { user: { id: string } };
    const uid = uj.user.id;
    await prisma.member.create({ data: { id: randomUUID(), userId: uid, organizationId: org.id, role: "owner" } });

    // An installed system, the same shape the approval path produces.
    const app = await prisma.app.findUnique({ where: { slug: "grocery" }, select: { id: true, version: true } });
    if (!app) throw new Error("grocery is not in the catalog");
    await prisma.organizationApp.create({
      data: {
        id: randomUUID(),
        organizationId: org.id,
        appId: app.id,
        status: "active",
        version: app.version,
        activatedAt: new Date(),
      },
    });

    const si = await fetch(`${BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE, referer: `${BASE}/signin` },
      body: JSON.stringify({ email, password: PW }),
    });
    const sij = (await si.json()) as { token?: string };
    check("signed in", si.status < 400, `sign-in -> ${si.status}`);
    if (sij.token) {
      await prisma.session.updateMany({ where: { token: sij.token }, data: { activeOrganizationId: org.id } });
    }
    const cookie = (si.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");

    // The tab is read from the DOM, not from a server string, because the whole
    // point is that the reader can see it.
    const resp = await page.goto(`${BASE}/systems`, { waitUntil: "domcontentloaded" });
    check("systems loads", resp?.status() === 200, `status=${resp?.status()}`);
    await page.setCookie(
      { name: "__Secure-bos.session_token", value: cookie.split("=")[1] ?? "", domain: "bosc.dpdns.org", path: "/" },
    ).catch(() => undefined);
    const p = await page.goto(`${BASE}/${org.slug}/profile?tab=systems`, { waitUntil: "networkidle2" });
    check("profile systems tab loads", p?.status() === 200, `status=${p?.status()} url=${p?.url()}`);

    const found = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll("a")).filter((a) =>
        (a.textContent || "").trim() === "افتح النظام",
      );
      const overlay = document.querySelector('a.absolute.inset-0.z-0');
      return {
        count: links.length,
        href: links[0]?.getAttribute("href") ?? null,
        // Hit-testing is the real assertion: the parent sets pointer-events-none
        // on the card body, so a painted button can look perfect and swallow
        // nothing. The re-enabling selector has to actually apply.
        clickable: links[0]
          ? (() => {
              const r = links[0]!.getBoundingClientRect();
              const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
              return Boolean(hit && (hit === links[0] || links[0]!.contains(hit)));
            })()
          : false,
        overlayHref: overlay?.getAttribute("href") ?? null,
      };
    });
    check("an installed system shows a visible open button", found.count === 1, `found=${found.count} href=${found.href}`);
    check("the open button is the org's own copy", found.href === `/${org.slug}/grocery`, `href=${found.href}`);
    check("the open button is actually clickable", found.clickable === true, `hitTest=${found.clickable}`);
    check(
      "the open button and the card overlay agree",
      found.overlayHref === found.href,
      `overlay=${found.overlayHref} button=${found.href}`,
    );

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    );
    check("the tab does not overflow horizontally", overflow, "scrollWidth <= clientWidth");
  } finally {
    await browser.close();
    // Retries: the running server may still hold a handle on the vault folder it
    // created when the profile page resolved the org, and a failed cleanup that
    // takes the rest of the `finally` with it is how probe folders accumulate.
    await new Promise((r) => setTimeout(r, 1500));
    try {
      rmSync(orgVaultPaths(org.slug).root, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 });
    } catch (e) {
      console.log(`      (vault folder left behind: ${(e as Error).message.split("\n")[0]})`);
    }
    await prisma.organizationApp.deleteMany({ where: { organizationId: org.id } });
    await prisma.organizationAppRequest.deleteMany({ where: { organizationId: org.id } });
    await prisma.member.deleteMany({ where: { organizationId: org.id } });
    await prisma.auditLog.deleteMany({ where: { organizationId: org.id } });
    await prisma.organization.deleteMany({ where: { id: org.id } });
    const uu = await prisma.user.findUnique({ where: { email } });
    if (uu) {
      await prisma.auditLog.deleteMany({ where: { actorUserId: uu.id } });
      await prisma.session.deleteMany({ where: { userId: uu.id } });
      await prisma.account.deleteMany({ where: { userId: uu.id } });
      await prisma.user.deleteMany({ where: { id: uu.id } });
    }
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